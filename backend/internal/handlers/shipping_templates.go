package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	appmw "ordermgmt/internal/middleware"
)

// Export templates staff can replace without a code change. 7-ELEVEN re-issues its macro-enabled import
// template regularly (new version number + new VBA macros, same columns); the export only appends rows
// to it, so any file with the same layout works. The upload is checked against that layout so a wrong
// or older file is refused with a clear message instead of producing exports 7-ELEVEN rejects.

const maxTemplateBytes = 5 << 20

type cvsTemplateSpec struct {
	ext         string
	sheet       string
	headerRow   int
	headers     []string // cells A.. of the header row
	macro       bool     // must contain vbaProject.bin
	versionBook string   // sheet holding the version number ("" = no version)
	versionCell string
	baseVersion string // version of the template shipped with the app
}

var cvsTemplateSpecs = map[string]cvsTemplateSpec{
	"cvs_711": {
		ext: ".xlsm", sheet: "訂單匯入", headerRow: 6,
		headers: []string{"＊取件人姓名", "＊取件人手機", "＊取件門市", "* 溫層", "＊商品", "＊訂單金額", "＊運費金額", "買家下訂日期", "商品備註", "其他資訊\n(FB/LINE/IG帳號)"},
		macro:   true, versionBook: "填寫說明", versionCell: "B1", baseVersion: "1.6",
	},
	"cvs_familymart": {
		ext: ".xlsx", sheet: "大量匯單", headerRow: 19,
		headers: []string{"取件人姓名", "取件人手機", "取件門市", "商品金額", "運費金額", "訂購日期", "商品"},
	},
}

// ---- minimal xlsx reader (just enough to read a sheet's cells and the sheet names) ----

type xlsxPackage struct {
	files   map[string]*zip.File
	shared  []string
	sheets  map[string]string // sheet name -> part path
	hasPart func(string) bool
}

func (p *xlsxPackage) read(name string) ([]byte, error) {
	f, ok := p.files[name]
	if !ok {
		return nil, fmt.Errorf("missing %s", name)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(io.LimitReader(rc, 20<<20))
}

func openXlsx(data []byte) (*xlsxPackage, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("not a valid Excel file")
	}
	p := &xlsxPackage{files: map[string]*zip.File{}, sheets: map[string]string{}}
	for _, f := range zr.File {
		p.files[f.Name] = f
	}
	p.hasPart = func(n string) bool { _, ok := p.files[n]; return ok }

	wbXML, err := p.read("xl/workbook.xml")
	if err != nil {
		return nil, errors.New("not a valid Excel file")
	}
	var wb struct {
		Sheets []struct {
			Name string `xml:"name,attr"`
			RID  string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
		} `xml:"sheets>sheet"`
	}
	if xml.Unmarshal(wbXML, &wb) != nil {
		return nil, errors.New("not a valid Excel file")
	}
	relXML, err := p.read("xl/_rels/workbook.xml.rels")
	if err != nil {
		return nil, errors.New("not a valid Excel file")
	}
	var rels struct {
		R []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
		} `xml:"Relationship"`
	}
	if xml.Unmarshal(relXML, &rels) != nil {
		return nil, errors.New("not a valid Excel file")
	}
	target := map[string]string{}
	for _, r := range rels.R {
		t := r.Target
		if strings.HasPrefix(t, "/") {
			t = strings.TrimPrefix(t, "/")
		} else {
			t = path.Join("xl", t)
		}
		target[r.ID] = t
	}
	for _, s := range wb.Sheets {
		p.sheets[s.Name] = target[s.RID]
	}
	if ssXML, err := p.read("xl/sharedStrings.xml"); err == nil {
		var sst struct {
			SI []struct {
				T string `xml:"t"`
				R []struct {
					T string `xml:"t"`
				} `xml:"r"`
			} `xml:"si"`
		}
		if xml.Unmarshal(ssXML, &sst) == nil {
			for _, si := range sst.SI {
				s := si.T
				for _, r := range si.R {
					s += r.T
				}
				p.shared = append(p.shared, s)
			}
		}
	}
	return p, nil
}

// cells returns ref ("A6") -> text for the whole sheet.
func (p *xlsxPackage) cells(sheet string) (map[string]string, error) {
	part, ok := p.sheets[sheet]
	if !ok || part == "" {
		return nil, fmt.Errorf("sheet %q not found", sheet)
	}
	raw, err := p.read(part)
	if err != nil {
		return nil, err
	}
	var ws struct {
		Cells []struct {
			Ref  string `xml:"r,attr"`
			Type string `xml:"t,attr"`
			V    string `xml:"v"`
			IS   struct {
				T string `xml:"t"`
			} `xml:"is"`
		} `xml:"sheetData>row>c"`
	}
	if xml.Unmarshal(raw, &ws) != nil {
		return nil, errors.New("not a valid Excel file")
	}
	out := make(map[string]string, len(ws.Cells))
	for _, c := range ws.Cells {
		switch c.Type {
		case "s":
			if i, err := strconv.Atoi(strings.TrimSpace(c.V)); err == nil && i >= 0 && i < len(p.shared) {
				out[c.Ref] = p.shared[i]
			}
		case "inlineStr":
			out[c.Ref] = c.IS.T
		default:
			out[c.Ref] = c.V
		}
	}
	return out, nil
}

func squashSpace(s string) string { return strings.Join(strings.Fields(s), "") }

// compareVersions compares dotted numbers ("1.10" > "1.9"); ok=false when either is not numeric.
func compareVersions(a, b string) (int, bool) {
	pa, pb := strings.Split(strings.TrimSpace(a), "."), strings.Split(strings.TrimSpace(b), ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		var err error
		if i < len(pa) {
			if x, err = strconv.Atoi(pa[i]); err != nil {
				return 0, false
			}
		}
		if i < len(pb) {
			if y, err = strconv.Atoi(pb[i]); err != nil {
				return 0, false
			}
		}
		if x != y {
			if x < y {
				return -1, true
			}
			return 1, true
		}
	}
	return 0, true
}

// validateTemplate checks an uploaded file against the provider's layout. It returns the version number
// (7-ELEVEN) or "" and a message safe to show staff.
func validateTemplate(spec cvsTemplateSpec, filename string, data []byte, currentVersion string) (string, error) {
	if !strings.EqualFold(path.Ext(filename), spec.ext) {
		return "", fmt.Errorf("the file must be an %s file", spec.ext)
	}
	pkg, err := openXlsx(data)
	if err != nil {
		return "", err
	}
	if spec.macro && !pkg.hasPart("xl/vbaProject.bin") {
		return "", errors.New("this file has no macros: upload the original macro-enabled template from the platform")
	}
	cells, err := pkg.cells(spec.sheet)
	if err != nil {
		return "", fmt.Errorf("sheet %q not found: this is not the expected template", spec.sheet)
	}
	for i, h := range spec.headers {
		ref := fmt.Sprintf("%c%d", 'A'+i, spec.headerRow)
		if squashSpace(cells[ref]) != squashSpace(h) {
			return "", fmt.Errorf("the columns changed: cell %s should be %q but is %q. This needs a code update", ref, strings.Join(strings.Fields(h), " "), strings.Join(strings.Fields(cells[ref]), " "))
		}
	}
	version := ""
	if spec.versionBook != "" {
		vc, err := pkg.cells(spec.versionBook)
		if err != nil {
			return "", fmt.Errorf("sheet %q not found: this is not the expected template", spec.versionBook)
		}
		version = strings.TrimSpace(vc[spec.versionCell])
		if version == "" {
			return "", errors.New("the template version number was not found")
		}
		if cmp, ok := compareVersions(version, currentVersion); ok && cmp < 0 {
			return "", fmt.Errorf("this template is version %s, older than the current version %s: the platform would reject it", version, currentVersion)
		}
	}
	return version, nil
}

// ---- handlers ----

type templateMeta struct {
	ID         int    `json:"id"`
	Filename   string `json:"filename"`
	Version    string `json:"version"`
	SizeBytes  int    `json:"size_bytes"`
	UploadedBy string `json:"uploaded_by"`
	UploadedAt string `json:"uploaded_at"`
	Active     bool   `json:"active"`
}

type templateProviderView struct {
	Provider       string         `json:"provider"`
	BuiltinVersion string         `json:"builtin_version"`
	Active         *templateMeta  `json:"active"`
	History        []templateMeta `json:"history"`
}

var templateProviderOrder = []string{"cvs_711", "cvs_familymart"}

func (h *ShippingWorkbenchHandler) loadTemplateMetas(ctx context.Context, provider string) ([]templateMeta, error) {
	rows, err := h.DB.Query(ctx, `
		SELECT t.id, t.filename, t.version, t.size_bytes, COALESCE(u.name,''), t.uploaded_at, t.active
		FROM shipping_templates t LEFT JOIN users u ON u.id = t.uploaded_by
		WHERE t.provider = $1 ORDER BY t.uploaded_at DESC, t.id DESC LIMIT 20`, provider)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []templateMeta{}
	for rows.Next() {
		var m templateMeta
		var at time.Time
		if err := rows.Scan(&m.ID, &m.Filename, &m.Version, &m.SizeBytes, &m.UploadedBy, &at, &m.Active); err != nil {
			return nil, err
		}
		m.UploadedAt = at.Format(time.RFC3339)
		out = append(out, m)
	}
	return out, rows.Err()
}

// Templates lists the active upload and the recent history per provider.
func (h *ShippingWorkbenchHandler) Templates(w http.ResponseWriter, r *http.Request) {
	out := []templateProviderView{}
	for _, p := range templateProviderOrder {
		metas, err := h.loadTemplateMetas(r.Context(), p)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load templates")
			return
		}
		v := templateProviderView{Provider: p, BuiltinVersion: cvsTemplateSpecs[p].baseVersion, History: []templateMeta{}}
		for i := range metas {
			if metas[i].Active {
				m := metas[i]
				v.Active = &m
			} else if len(v.History) < 5 {
				v.History = append(v.History, metas[i])
			}
		}
		out = append(out, v)
	}
	respondJSON(w, http.StatusOK, out)
}

// TemplateFile serves the active uploaded template; 404 means "use the built-in one".
func (h *ShippingWorkbenchHandler) TemplateFile(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if _, ok := cvsTemplateSpecs[provider]; !ok {
		respondError(w, http.StatusNotFound, "unknown provider")
		return
	}
	var data []byte
	err := h.DB.QueryRow(r.Context(), `SELECT content FROM shipping_templates WHERE provider=$1 AND active`, provider).Scan(&data)
	if err != nil {
		respondError(w, http.StatusNotFound, "no uploaded template")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(data)
}

func (h *ShippingWorkbenchHandler) currentTemplateVersion(ctx context.Context, provider string) string {
	var v string
	if h.DB.QueryRow(ctx, `SELECT version FROM shipping_templates WHERE provider=$1 AND active`, provider).Scan(&v) == nil && v != "" {
		return v
	}
	return cvsTemplateSpecs[provider].baseVersion
}

// UploadTemplate validates and activates a new template.
func (h *ShippingWorkbenchHandler) UploadTemplate(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	spec, ok := cvsTemplateSpecs[provider]
	if !ok {
		respondError(w, http.StatusNotFound, "unknown provider")
		return
	}
	claims := appmw.GetClaims(r)
	r.Body = http.MaxBytesReader(w, r.Body, maxTemplateBytes+(1<<20))
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "choose a file to upload (max 5 MB)")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxTemplateBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxTemplateBytes {
		respondError(w, http.StatusBadRequest, "the file is empty or larger than 5 MB")
		return
	}
	version, err := validateTemplate(spec, header.Filename, data, h.currentTemplateVersion(r.Context(), provider))
	if err != nil {
		respondError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save template")
		return
	}
	defer tx.Rollback(r.Context())
	var id int
	if _, err := tx.Exec(r.Context(), `UPDATE shipping_templates SET active=false WHERE provider=$1 AND active`, provider); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save template")
		return
	}
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO shipping_templates (provider, filename, version, content, size_bytes, uploaded_by, active)
		VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
		provider, path.Base(header.Filename), version, data, len(data), claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save template")
		return
	}
	detail := fmt.Sprintf("%s: %s", provider, path.Base(header.Filename))
	if version != "" {
		detail += " (version " + version + ")"
	}
	logActivity(r.Context(), tx, "shipping_template", id, "template_uploaded", &claims.UserID, detail)
	if err := tx.Commit(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save template")
		return
	}
	h.Templates(w, r)
}

// ActivateTemplate restores an earlier upload ({id}), or the built-in template when id is "builtin".
func (h *ShippingWorkbenchHandler) ActivateTemplate(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if _, ok := cvsTemplateSpecs[provider]; !ok {
		respondError(w, http.StatusNotFound, "unknown provider")
		return
	}
	claims := appmw.GetClaims(r)
	idParam := chi.URLParam(r, "id")
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to switch template")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `UPDATE shipping_templates SET active=false WHERE provider=$1 AND active`, provider); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to switch template")
		return
	}
	id, detail := 0, provider+": built-in template"
	if idParam != "builtin" {
		n, err := strconv.Atoi(idParam)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid template")
			return
		}
		var fn, ver string
		if err := tx.QueryRow(r.Context(), `UPDATE shipping_templates SET active=true WHERE id=$1 AND provider=$2 RETURNING filename, version`, n, provider).Scan(&fn, &ver); err != nil {
			respondError(w, http.StatusNotFound, "template not found")
			return
		}
		id, detail = n, provider+": "+fn
		if ver != "" {
			detail += " (version " + ver + ")"
		}
	}
	logActivity(r.Context(), tx, "shipping_template", id, "template_restored", &claims.UserID, detail)
	if err := tx.Commit(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to switch template")
		return
	}
	h.Templates(w, r)
}

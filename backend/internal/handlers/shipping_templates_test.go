package handlers

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"strings"
	"testing"
)

const tplDir = "../../../frontend/public/cvs-templates/"

func loadTpl(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(tplDir + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// rewrite returns the zip with fn applied to each part's content (fn returns nil data to drop the part).
func rewrite(t *testing.T, src []byte, fn func(name string, data []byte) []byte) []byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(src), int64(len(src)))
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, f := range zr.File {
		rc, _ := f.Open()
		data, _ := io.ReadAll(rc)
		rc.Close()
		out := fn(f.Name, data)
		if out == nil {
			continue
		}
		w, _ := zw.Create(f.Name)
		w.Write(out)
	}
	zw.Close()
	return buf.Bytes()
}

func TestValidateTemplate(t *testing.T) {
	spec := cvsTemplateSpecs["cvs_711"]
	good := loadTpl(t, "711.xlsm")

	v, err := validateTemplate(spec, "賣貨便_訂單匯入.xlsm", good, "1.6")
	if err != nil || v != "1.6" {
		t.Fatalf("shipped template must validate as 1.6, got %q %v", v, err)
	}
	if _, err := validateTemplate(spec, "x.xlsx", good, "1.6"); err == nil {
		t.Error("wrong extension must be refused")
	}
	if _, err := validateTemplate(spec, "x.xlsm", []byte("not a zip"), "1.6"); err == nil {
		t.Error("garbage must be refused")
	}
	if _, err := validateTemplate(spec, "x.xlsm", good, "1.7"); err == nil || !strings.Contains(err.Error(), "older") {
		t.Errorf("an older version must be refused, got %v", err)
	}
	if _, err := validateTemplate(spec, "x.xlsm", good, "1.10"); err == nil {
		t.Error("1.6 is older than 1.10")
	}
	noMacro := rewrite(t, good, func(n string, d []byte) []byte {
		if n == "xl/vbaProject.bin" {
			return nil
		}
		return d
	})
	if _, err := validateTemplate(spec, "x.xlsm", noMacro, "1.6"); err == nil || !strings.Contains(err.Error(), "macros") {
		t.Errorf("a file without macros must be refused, got %v", err)
	}
	changed := rewrite(t, good, func(n string, d []byte) []byte {
		if n == "xl/sharedStrings.xml" {
			return bytes.Replace(d, []byte("＊取件人姓名"), []byte("＊收件人姓名"), -1)
		}
		return d
	})
	if _, err := validateTemplate(spec, "x.xlsm", changed, "1.6"); err == nil || !strings.Contains(err.Error(), "columns changed") {
		t.Errorf("changed columns must be refused, got %v", err)
	}
	newer := rewrite(t, good, func(n string, d []byte) []byte {
		if n == "xl/sharedStrings.xml" {
			return bytes.Replace(d, []byte(">1.6<"), []byte(">1.7<"), 1)
		}
		return d
	})
	if v, err := validateTemplate(spec, "x.xlsm", newer, "1.6"); err != nil || v != "1.7" {
		t.Errorf("a newer version must be accepted, got %q %v", v, err)
	}

	fm := cvsTemplateSpecs["cvs_familymart"]
	if _, err := validateTemplate(fm, "FamilyMart.xlsx", loadTpl(t, "FamilyMart.xlsx"), ""); err != nil {
		t.Errorf("shipped FamilyMart template must validate: %v", err)
	}
	if _, err := validateTemplate(fm, "x.xlsx", good, ""); err == nil {
		t.Error("the 7-ELEVEN file is not a FamilyMart template")
	}
}

func TestCompareVersions(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{{"1.6", "1.5", 1}, {"1.5", "1.6", -1}, {"1.10", "1.9", 1}, {"2", "2.0", 0}} {
		if got, ok := compareVersions(c.a, c.b); !ok || got != c.want {
			t.Errorf("%s vs %s = %d,%v want %d", c.a, c.b, got, ok, c.want)
		}
	}
}

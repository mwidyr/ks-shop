package handlers

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSanitizeInlineHTML(t *testing.T) {
	cases := map[string]string{
		`<strong>a</strong> & <em>b</em>`:                       `<strong>a</strong> &amp; <em>b</em>`,
		`<script>alert(1)</script>hi`:                           `hi`,
		`<img src=x onerror=alert(1)>ok`:                        `ok`,
		`<a href="javascript:alert(1)">x</a>`:                   `x</a>`,
		`<a href="https://e.com/?a=1&b=2" onclick="x()">go</a>`: `<a href="https://e.com/?a=1&amp;b=2" rel="noopener">go</a>`,
		`<a href='/style'>in</a>`:                               `<a href="/style" rel="noopener">in</a>`,
		`<p onclick="x">para</p>`:                               `para`,
		`<a href="//evil.com">x</a>`:                            `x`,
		`<b>bold</b>`:                                           `<strong>bold</strong>`,
		`1 &lt; 2 <unknown>y</unknown>`:                         `1 &lt; 2 y`,
	}
	for in, want := range cases {
		got := sanitizeInlineHTML(in)
		if strings.Contains(in, "javascript:") {
			// closing tag without an opening one must not leak
			if strings.Contains(got, "<a") || strings.Contains(got, "javascript") || strings.Contains(got, "</a>") {
				t.Errorf("sanitize(%q) = %q", in, got)
			}
			continue
		}
		if got != want {
			t.Errorf("sanitize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCleanBodyBlocks(t *testing.T) {
	out, err := cleanBodyBlocks(json.RawMessage(`[{"type":"p","text":"x","html":"<script>1</script><strong>x</strong>"},{"type":"list","items":["a"],"items_html":["<em>a</em><img src=x>"]}]`))
	if err != nil {
		t.Fatal(err)
	}
	var got []map[string]interface{}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatal(err)
	}
	if got[0]["html"] != "<strong>x</strong>" || got[1]["items_html"].([]interface{})[0] != "<em>a</em>" {
		t.Errorf("unexpected: %s", out)
	}
	if _, err := cleanBodyBlocks(json.RawMessage(`[{"type":"iframe"}]`)); err == nil {
		t.Error("unknown block type must be rejected")
	}
	if out, _ := cleanBodyBlocks(nil); string(out) != "[]" {
		t.Errorf("nil -> %s", out)
	}
}

func TestSanitizeRichHTML(t *testing.T) {
	in := `<p>Hi <u>there</u> <strong>x</strong></p><ul><li>a</li><li><a href="javascript:alert(1)">b</a></li></ul><ol><li>c</li></ol><script>x()</script><div>d</div>`
	got := sanitizeRichHTML(in)
	want := `<p>Hi <u>there</u> <strong>x</strong></p><ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>d`
	if got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	// inline sanitising (headings, list items) still drops the block tags but keeps underline
	if got := sanitizeInlineHTML(`<p>a <u>b</u></p><ul><li>c</li></ul>`); got != `a <u>b</u>c` {
		t.Errorf("inline = %s", got)
	}
}

func TestCleanBodyBlocksRichByType(t *testing.T) {
	raw := json.RawMessage(`[{"type":"p","text":"x","html":"<ul><li>a</li></ul>"},{"type":"h2","text":"T","html":"<p><u>T</u></p>"}]`)
	out, err := cleanBodyBlocks(raw)
	if err != nil {
		t.Fatal(err)
	}
	var back []map[string]any
	_ = json.Unmarshal(out, &back)
	s := back[0]["html"].(string) + "|" + back[1]["html"].(string)
	if !strings.Contains(s, `<ul><li>a</li></ul>`) || !strings.Contains(s, `<u>T</u>`) || strings.Contains(s, `<p>`) {
		t.Errorf("unexpected: %s", s)
	}
}

package mailer

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"time"

	"ordermgmt/internal/config"
)

const dialTimeout = 10 * time.Second
const sessionTimeout = 20 * time.Second
const httpTimeout = 15 * time.Second

// Send delivers a plain-text email, preferring Resend's HTTPS API (cfg.ResendAPIKey) when
// configured, falling back to plain SMTP (cfg.SMTPHost), falling back further to just logging
// the message to stdout when neither is set - fine for local dev, no real credentials needed to
// test the invite/reset-password/OTP flows.
//
// Resend is checked first because outbound SMTP ports are frequently blocked by VPS network/
// firewalls as an anti-spam default (confirmed on this project's own VPS: dial timeouts to
// smtp.gmail.com:587 even with correct credentials) while outbound HTTPS essentially never is.
//
// The actual send always runs in a background goroutine with a bounded timeout and this always
// returns nil immediately - every caller (invite/reset-password/OTP) already discarded the
// synchronous error anyway, but neither net/smtp.SendMail nor a bare http.Client has a timeout by
// default, so a blocked/slow provider could otherwise hang the whole HTTP request (e.g. "Add
// Staff") until the browser/proxy's own timeout, with no server-side log explaining why. The
// user row/token is already committed to the DB by the time this is called, so a failed send
// just means the email didn't go out, not that the action itself failed.
func Send(cfg config.Config, to, subject, body string) error {
	switch {
	case cfg.ResendAPIKey != "":
		go func() {
			if err := sendViaResend(cfg, to, subject, body); err != nil {
				log.Printf("[mailer] failed to send to %s via Resend: %v", to, err)
			} else {
				log.Printf("[mailer] sent to %s via Resend", to)
			}
		}()
	case cfg.SMTPHost != "":
		go func() {
			addr := cfg.SMTPHost + ":" + cfg.SMTPPort
			if err := sendViaSMTP(cfg, addr, to, subject, body); err != nil {
				log.Printf("[mailer] failed to send to %s via %s: %v", to, addr, err)
			} else {
				log.Printf("[mailer] sent to %s via %s", to, addr)
			}
		}()
	default:
		log.Printf("[mailer] no email provider configured, logging email instead:\nTo: %s\nSubject: %s\n%s\n", to, subject, body)
	}
	return nil
}

func sendViaResend(cfg config.Config, to, subject, body string) error {
	payload, err := json.Marshal(map[string]string{
		"from":    cfg.ResendFrom,
		"to":      to,
		"subject": subject,
		"text":    body,
	})
	if err != nil {
		return fmt.Errorf("encode payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: httpTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend returned %d: %s", resp.StatusCode, respBody)
	}
	return nil
}

func sendViaSMTP(cfg config.Config, addr, to, subject, body string) error {
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	conn.SetDeadline(time.Now().Add(sessionTimeout))
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		return fmt.Errorf("handshake: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.SMTPHost}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	if ok, _ := client.Extension("AUTH"); ok {
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}

	if err := client.Mail(cfg.SMTPFrom); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.SMTPFrom, to, subject, body)
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return client.Quit()
}

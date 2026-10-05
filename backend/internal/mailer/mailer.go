package mailer

import (
	"fmt"
	"log"
	"net/smtp"

	"ordermgmt/internal/config"
)

// Send delivers a plain-text email. When cfg.SMTPHost is unset (no provider configured), it
// logs the message to stdout instead of sending - lets invite/reset flows be tested locally
// without real SMTP credentials; set SMTP_HOST etc. to send for real (e.g. Gmail's
// smtp.gmail.com:587 with an app password).
func Send(cfg config.Config, to, subject, body string) error {
	if cfg.SMTPHost == "" {
		log.Printf("[mailer] SMTP not configured, logging email instead:\nTo: %s\nSubject: %s\n%s\n", to, subject, body)
		return nil
	}

	addr := cfg.SMTPHost + ":" + cfg.SMTPPort
	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.SMTPFrom, to, subject, body)

	err := smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
	if err != nil {
		// Every caller (invite/reset-password/OTP) discards this error to keep the API response
		// unaffected by a flaky mail provider - this is the only place a real send failure (bad
		// app password, connection refused, etc.) ever surfaces, so it must be logged here.
		log.Printf("[mailer] failed to send to %s via %s: %v", to, addr, err)
	} else {
		log.Printf("[mailer] sent to %s via %s", to, addr)
	}
	return err
}

-- Adds an attempts counter to auth_tokens so short numeric codes (login OTP) can be locked
-- out after a few wrong guesses. The existing purposes (invite/reset) use a 32-byte random hex
-- token embedded in an emailed link - infeasible to guess, so they never needed this. A 6-digit
-- login code is short enough that unlimited guesses would matter within its validity window.
ALTER TABLE auth_tokens ADD COLUMN attempts INT NOT NULL DEFAULT 0;

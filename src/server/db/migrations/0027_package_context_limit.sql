-- Package başına context token limiti (null = limitsiz)
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS max_context_tokens integer;

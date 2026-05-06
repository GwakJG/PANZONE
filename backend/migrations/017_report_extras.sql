-- Reports: store structured reason codes (max 2) + attached evidence images (max 2).
-- `reason` TEXT stays for the formatted human-readable summary (admin page can render either).

ALTER TABLE reports
  ADD COLUMN reason_codes JSON NULL AFTER reason,
  ADD COLUMN image_urls   JSON NULL AFTER reason_codes;

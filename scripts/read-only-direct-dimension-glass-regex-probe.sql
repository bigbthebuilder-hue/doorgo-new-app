-- READ-ONLY DIRECT-DIMENSION GLASS REGEX PROBE
-- NO DDL OR DML
-- RUN BEFORE RETRYING THE MIGRATION
-- Tests PostgreSQL syntax and the persistence character boundary, not geometric validity.
WITH cases(value,expected,label) AS (
  VALUES
    ('11-3/4"',true,'fraction with quote'),('13 5/8"',true,'mixed fraction'),
    ('20',true,'integer'),('20"',true,'integer with quote'),('51-7/8',true,'fraction'),
    ('14 1/8"',true,'mixed fraction with quote'),('',false,'empty'),('   ',false,'spaces only'),
    ('twelve',false,'alphabetic'),('12;3',false,'SQL punctuation'),('{"width":12}',false,'object-like'),
    ('123456789012345678901234567890123',false,'over 32 characters'),('12,3',false,'malformed character grammar')
), evaluated AS (
  SELECT label,value,expected,
    pg_catalog.length(pg_catalog.btrim(value)) BETWEEN 1 AND 32
      AND pg_catalog.btrim(value) ~ '^[0-9[:space:]./''"′’″“”-]+$' AS actual
  FROM cases
)
SELECT label,value,expected,actual,(actual=expected) AS passed FROM evaluated ORDER BY label;

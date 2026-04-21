-- ── Migration: Add className, subject, teacherId directly to exams ──
-- This SQL runs BEFORE prisma db push, so columns exist when Prisma Client starts.
-- Safe to run multiple times (all operations are idempotent).

DO $$
BEGIN
  -- 1. Add class_name column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exams' AND column_name = 'class_name'
  ) THEN
    ALTER TABLE exams ADD COLUMN class_name VARCHAR(255) DEFAULT 'JSS1';
    RAISE NOTICE '[Migration] Added class_name column.';
  ELSE
    RAISE NOTICE '[Migration] class_name already exists.';
  END IF;

  -- 2. Add subject column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exams' AND column_name = 'subject'
  ) THEN
    ALTER TABLE exams ADD COLUMN subject VARCHAR(255) DEFAULT 'General';
    RAISE NOTICE '[Migration] Added subject column.';
  ELSE
    RAISE NOTICE '[Migration] subject already exists.';
  END IF;

  -- 3. Add teacher_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exams' AND column_name = 'teacher_id'
  ) THEN
    ALTER TABLE exams ADD COLUMN teacher_id VARCHAR(255);
    RAISE NOTICE '[Migration] Added teacher_id column.';
  ELSE
    RAISE NOTICE '[Migration] teacher_id already exists.';
  END IF;

  -- 4. Copy data from teacher_assignments if that table still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'teacher_assignments'
  ) THEN
    RAISE NOTICE '[Migration] teacher_assignments found, copying data...';

    UPDATE exams e
    SET
      class_name = ta.class_name,
      subject = ta.subject,
      teacher_id = ta.teacher_id
    FROM teacher_assignments ta
    WHERE e.assignment_id = ta.id;

    RAISE NOTICE '[Migration] Data copied from teacher_assignments.';
  ELSE
    RAISE NOTICE '[Migration] teacher_assignments already removed, skipping copy.';
  END IF;

  -- 5. Set safe defaults for any rows still missing values
  UPDATE exams SET class_name = 'JSS1' WHERE class_name IS NULL OR class_name = '';
  UPDATE exams SET subject = 'General' WHERE subject IS NULL OR subject = '';

  -- 6. Assign any orphaned exams to the first active teacher
  IF EXISTS (SELECT 1 FROM exams WHERE teacher_id IS NULL) THEN
    UPDATE exams e
    SET teacher_id = t.id
    FROM teachers t
    WHERE e.teacher_id IS NULL
      AND t.status = 'ACTIVE'
      AND t.id = (
        SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1
      );
    RAISE NOTICE '[Migration] Assigned orphan exams to an active teacher.';
  END IF;

  RAISE NOTICE '[Migration] Complete.';
END
$$;

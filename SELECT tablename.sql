SELECT id, workout_name, weight_kg, reps, created_at
FROM workout_logs
WHERE user_id = 2
ORDER BY created_at DESC
LIMIT 50;

-- id 340운동의 reps를 12가 아니라 10으로 바꿔야하면
UPDATE workout_logs
SET reps = 10
WHERE id = 340
  AND user_id = 2;

SELECT id, workout_name, weight_kg, reps, created_at
FROM workout_logs
WHERE user_id = 2
  AND workout_name = '랫풀다운'
ORDER BY created_at ASC;

UPDATE workout_logs
SET weight_kg = ROUND((weight_kg * 0.453592)::numeric, 2)
WHERE id IN (
  100,135,101,134,133,132,103,102,
  28,29,30,
  89,90,91,92,93,
  259,260,261,262
)
AND user_id = 2;
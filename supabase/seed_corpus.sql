insert into corpus_imports (name, source_type, item_count, status)
values ('Sema launch corpus seed', 'manual', 40, 'queued')
on conflict do nothing;

with seed_import as (
  select id from corpus_imports where name = 'Sema launch corpus seed' order by created_at desc limit 1
)
insert into corpus_items (import_id, language_code, text, domain, license, difficulty, metadata)
select seed_import.id, item.language_code, item.text, item.domain, item.license, item.difficulty, item.metadata::jsonb
from seed_import,
(values
  ('en', 'Where is the nearest hospital?', 'health', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'I need clean drinking water.', 'health', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The child has a fever.', 'health', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Please call a nurse now.', 'health', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The medicine should be taken after food.', 'health', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'How much is the fare to town?', 'transport', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The bus leaves in the morning.', 'transport', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Please stop at the next stage.', 'transport', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The road is flooded after heavy rain.', 'climate', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'The weather has changed this week.', 'climate', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The farmer planted maize before the rain.', 'agriculture', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'The cow has not eaten since morning.', 'agriculture', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Keep fertilizer away from children.', 'agriculture', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'The teacher asked the class to read aloud.', 'education', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'My daughter needs help with homework.', 'education', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The school meeting begins at nine.', 'education', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'I want to open a savings account.', 'finance', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'Please confirm the mobile money payment.', 'finance', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'How much did you receive?', 'finance', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The market is busy today.', 'commerce', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'How much is one kilogram of maize flour?', 'commerce', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Please write the total amount on the receipt.', 'commerce', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'Please help me fill this county form.', 'public services', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'Where can I collect my identity card?', 'public services', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'The public meeting has moved to Friday.', 'public services', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'Please send the message again.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'I do not understand.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Can you repeat that slowly?', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'My grandmother is resting inside the house.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'We will meet at home in the evening.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The elders will speak before the ceremony begins.', 'culture', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'Please explain the meaning of that proverb.', 'culture', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'This song is usually sung during harvest time.', 'culture', 'Sema internal seed', 'advanced', '{"seed":true}'),
  ('en', 'My phone battery is almost empty.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'The network is weak in this village.', 'everyday conversation', 'Sema internal seed', 'beginner', '{"seed":true}'),
  ('en', 'Can you help me change the password?', 'everyday conversation', 'Sema internal seed', 'intermediate', '{"seed":true}'),
  ('en', 'I want to report the matter at the police station.', 'public services', 'Sema internal seed', 'advanced', '{"seed":true}'),
  ('en', 'Please read the statement before signing.', 'public services', 'Sema internal seed', 'advanced', '{"seed":true}'),
  ('en', 'I need someone to explain my rights.', 'public services', 'Sema internal seed', 'advanced', '{"seed":true}'),
  ('en', 'The witness will speak after the officer arrives.', 'public services', 'Sema internal seed', 'advanced', '{"seed":true}')
) as item(language_code, text, domain, license, difficulty, metadata)
on conflict (language_code, hash) do nothing;

delete from reviews
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by reviewer_id, target_type, target_id
        order by created_at desc nulls last, id desc
      ) as duplicate_rank
    from reviews
  ) ranked_reviews
  where duplicate_rank > 1
);

create unique index if not exists reviews_one_per_reviewer_target_idx
on reviews(reviewer_id, target_type, target_id);

create index if not exists consensus_target_idx
on consensus_decisions(target_type, target_id, decided_at);

create index if not exists translations_status_language_idx
on translations(status, language_code, created_at);

create index if not exists recordings_status_language_idx
on recordings(status, language_code, created_at);

create index if not exists issue_reports_status_severity_idx
on issue_reports(status, severity, created_at);

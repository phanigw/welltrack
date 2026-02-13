-- Create table for flattened workout sets (for history lookup & charts)
create table if not exists workout_sets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  date date not null,
  exercise text not null,
  set_index int not null,
  weight numeric default 0,
  reps numeric default 0,
  rpe numeric default null,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table workout_sets enable row level security;

-- Policy
create policy "Users can manage own workout sets"
  on workout_sets for all
  using (auth.uid() = user_id);

-- Optional: Index for faster lookups
create index if not exists idx_workout_sets_history 
  on workout_sets(user_id, exercise, date desc);

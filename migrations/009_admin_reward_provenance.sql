-- Admin grants are explicit, auditable server operations.
ALTER TABLE public.voxel_user_achievements ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES public.voxel_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.voxel_user_cosmetics ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES public.voxel_accounts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.voxel_achievement_reward_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.voxel_accounts(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES public.voxel_achievements(id) ON DELETE CASCADE,
  reward_kind TEXT NOT NULL,
  reward_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(user_id, achievement_id, reward_kind, reward_id)
);

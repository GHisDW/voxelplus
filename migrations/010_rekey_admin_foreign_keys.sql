-- Corrective migration: all privileged actor/target references use the
-- Voxel+ account tombstone table, never Supabase Auth.
ALTER TABLE public.voxel_owner_roles DROP CONSTRAINT IF EXISTS voxel_owner_roles_user_id_fkey;
ALTER TABLE public.voxel_owner_roles DROP CONSTRAINT IF EXISTS voxel_owner_roles_granted_by_fkey;
ALTER TABLE public.voxel_owner_roles ADD CONSTRAINT voxel_owner_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.voxel_accounts(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.voxel_owner_roles ADD CONSTRAINT voxel_owner_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.voxel_accounts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.voxel_owner_audit_log DROP CONSTRAINT IF EXISTS voxel_owner_audit_log_actor_id_fkey;
ALTER TABLE public.voxel_owner_audit_log DROP CONSTRAINT IF EXISTS voxel_owner_audit_log_target_id_fkey;
ALTER TABLE public.voxel_owner_audit_log ADD CONSTRAINT voxel_owner_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.voxel_accounts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.voxel_owner_audit_log ADD CONSTRAINT voxel_owner_audit_log_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.voxel_accounts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.voxel_user_titles DROP CONSTRAINT IF EXISTS voxel_user_titles_granted_by_fkey;
ALTER TABLE public.voxel_user_titles ADD CONSTRAINT voxel_user_titles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.voxel_accounts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.voxel_user_badges DROP CONSTRAINT IF EXISTS voxel_user_badges_granted_by_fkey;
ALTER TABLE public.voxel_user_badges ADD CONSTRAINT voxel_user_badges_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.voxel_accounts(id) ON DELETE SET NULL NOT VALID;

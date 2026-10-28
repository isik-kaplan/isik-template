
import pgtrigger.compiler
import pgtrigger.migrations
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_move_versions_only_on_a_change'),
    ]

    operations = [
        pgtrigger.migrations.AddTrigger(
            model_name='personalaccesstoken',
            trigger=pgtrigger.compiler.Trigger(name='notify_token_revoked', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF to_regclass(\'"notifications_noticekindpolicy"\') IS NOT NULL THEN INSERT INTO "notifications_notice" ("kind_id", "variant", "subject_label", "subject_id", "subject_partition", "snapshot", "previous", "actor_id", "context", "pgh_context_id") SELECT \'token_revoked\', NULL, \'users.PersonalAccessToken\', (CASE WHEN TG_OP = \'DELETE\' THEN OLD."id" ELSE NEW."id" END)::text, NULL, jsonb_build_object(\'user\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."user_id" ELSE NEW."user_id" END, \'name\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."name" ELSE NEW."name" END), NULL, (NULLIF(current_setting(\'pghistory.context_metadata\', true), \'\')::jsonb ->> \'user\'), \'{}\'::jsonb, _pgh_attach_context() WHERE EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = \'token_revoked\' AND "retired_at" IS NULL); END IF; RETURN NULL;', hash='914d71ab963c1239bee5642b05f09f4acf00a88a', operation='DELETE', pgid='pgtrigger_notify_token_revoked_180a3', table='users_personalaccesstoken', when='AFTER')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='personalaccesstoken',
            trigger=pgtrigger.compiler.Trigger(name='notify_token_created', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF to_regclass(\'"notifications_noticekindpolicy"\') IS NOT NULL THEN INSERT INTO "notifications_notice" ("kind_id", "variant", "subject_label", "subject_id", "subject_partition", "snapshot", "previous", "actor_id", "context", "pgh_context_id") SELECT \'token_created\', NULL, \'users.PersonalAccessToken\', (CASE WHEN TG_OP = \'DELETE\' THEN OLD."id" ELSE NEW."id" END)::text, NULL, jsonb_build_object(\'user\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."user_id" ELSE NEW."user_id" END, \'name\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."name" ELSE NEW."name" END), NULL, (NULLIF(current_setting(\'pghistory.context_metadata\', true), \'\')::jsonb ->> \'user\'), \'{}\'::jsonb, _pgh_attach_context() WHERE EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = \'token_created\' AND "retired_at" IS NULL); END IF; RETURN NULL;', hash='75322c570bc2c248b3a5cf7b0478a0e1c2713f7d', operation='INSERT', pgid='pgtrigger_notify_token_created_d66a8', table='users_personalaccesstoken', when='AFTER')),
        ),
    ]

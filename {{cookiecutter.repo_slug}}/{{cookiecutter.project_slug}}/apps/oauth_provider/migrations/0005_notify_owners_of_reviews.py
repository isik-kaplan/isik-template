
import pgtrigger.compiler
import pgtrigger.migrations
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('oauth_provider', '0004_move_versions_only_on_a_change'),
    ]

    operations = [
        pgtrigger.migrations.AddTrigger(
            model_name='application',
            trigger=pgtrigger.compiler.Trigger(name='notify_application_reviewed', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF to_regclass(\'"notifications_noticekindpolicy"\') IS NOT NULL THEN IF (NEW."approval" = \'approved\' AND NOT (OLD."approval" = \'approved\')) THEN INSERT INTO "notifications_notice" ("kind_id", "variant", "subject_label", "subject_id", "subject_partition", "snapshot", "previous", "actor_id", "context", "pgh_context_id") SELECT \'application_reviewed\', \'approved\', \'oauth_provider.Application\', (CASE WHEN TG_OP = \'DELETE\' THEN OLD."id" ELSE NEW."id" END)::text, NULL, jsonb_build_object(\'user\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."user_id" ELSE NEW."user_id" END, \'name\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."name" ELSE NEW."name" END, \'approval\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."approval" ELSE NEW."approval" END), NULL, (NULLIF(current_setting(\'pghistory.context_metadata\', true), \'\')::jsonb ->> \'user\'), \'{}\'::jsonb, _pgh_attach_context() WHERE EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = \'application_reviewed\' AND "retired_at" IS NULL); END IF; IF (NEW."approval" = \'withdrawn\' AND NOT (OLD."approval" = \'withdrawn\')) THEN INSERT INTO "notifications_notice" ("kind_id", "variant", "subject_label", "subject_id", "subject_partition", "snapshot", "previous", "actor_id", "context", "pgh_context_id") SELECT \'application_reviewed\', \'withdrawn\', \'oauth_provider.Application\', (CASE WHEN TG_OP = \'DELETE\' THEN OLD."id" ELSE NEW."id" END)::text, NULL, jsonb_build_object(\'user\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."user_id" ELSE NEW."user_id" END, \'name\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."name" ELSE NEW."name" END, \'approval\', CASE WHEN TG_OP = \'DELETE\' THEN OLD."approval" ELSE NEW."approval" END), NULL, (NULLIF(current_setting(\'pghistory.context_metadata\', true), \'\')::jsonb ->> \'user\'), \'{}\'::jsonb, _pgh_attach_context() WHERE EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = \'application_reviewed\' AND "retired_at" IS NULL); END IF; END IF; RETURN NULL;', hash='d93d9ca7120afe08c1e98e484bfba03003941477', operation='UPDATE', pgid='pgtrigger_notify_application_reviewed_85c20', table='oauth_provider_application', when='AFTER')),
        ),
    ]

{%- if cookiecutter.webhooks == "users" %}

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.datetime
import django.utils.timezone
import isik.django.apps.common.db.models
import pgtrigger.compiler
import pgtrigger.migrations
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('pghistory', '0007_auto_20250421_0444'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Delivery',
            fields=[
                ('channel', models.CharField(db_comment="The registered channel it goes out on - inbox, email, webhook, or a project's own.", help_text='The channel it goes out on.', max_length=32)),
                ('partition', models.TextField(blank=True, db_comment='The partition its target lives in. Null when the project declares no partitions.', help_text='The partition its target lives in, or none.', null=True)),
                ('target_key', models.CharField(db_comment='Its target as one opaque key, unique per notice and channel.', help_text='Its target, as one key - what keeps a notice from reaching one target twice.', max_length=255)),
                ('state', models.CharField(choices=[('pending', 'Pending'), ('sending', 'Sending'), ('sent', 'Sent'), ('abandoned', 'Abandoned')], db_comment='pending (due at next_attempt_at), sending, sent or abandoned.', default='pending', help_text='pending, sending, sent or abandoned.', max_length=16)),
                ('attempt_count', models.PositiveIntegerField(db_comment="How many times it's been tried, in every run.", default=0, help_text="How many times it's been tried.")),
                ('attempts_before_run', models.PositiveIntegerField(db_comment='attempt_count when the current run began - a manual retry starts one. MAX_ATTEMPTS counts from it.', default=0, help_text='How many times it had been tried when its current run began.')),
                ('retry_trigger', models.CharField(blank=True, db_comment="What asked for its next attempt - manual - or empty. The attempt records it, and it's cleared.", default='', help_text="What asked for its next attempt, when it wasn't the send task.", max_length=32)),
                ('next_attempt_at', models.DateTimeField(db_comment="When it's next due to be tried.", default=django.utils.timezone.now, help_text="When it's next due.")),
                ('claimed_at', models.DateTimeField(blank=True, db_comment='When a worker last took it to send - reap_stranded takes back one sending too long.', help_text='When a worker last took it to send.', null=True)),
                ('sent_at', models.DateTimeField(blank=True, db_comment='When it was sent, or null.', help_text='When it was sent.', null=True)),
                ('created_at', models.DateTimeField(db_comment='When it was written.', db_default=django.db.models.functions.datetime.Now(), default=django.utils.timezone.now, help_text='When it was written.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='NoticeKindPolicy',
            fields=[
                ('kind', models.CharField(db_comment="The kind's name, as its declaration gives it. Never changes.", help_text="The kind's name, as its declaration gives it.", max_length=100, primary_key=True, serialize=False)),
                ('policy', models.CharField(choices=[('mandatory', 'Mandatory'), ('default_on', 'On unless turned off'), ('default_off', 'Off unless turned on')], db_comment='mandatory, default_on or default_off - mirrored from the declaration.', help_text='Who gets the kind: everyone its audience names, opted-out aside, or only the opted-in.', max_length=16)),
                ('scope', models.CharField(choices=[('single_partition', 'One partition'), ('cross_partition', 'Many partitions')], db_comment='single_partition or cross_partition - mirrored from the declaration.', help_text="Whether the kind's audience lives in one partition or many.", max_length=16)),
                ('source', models.CharField(choices=[('trigger', 'A trigger'), ('application', 'The application'), ('recorded', 'A record of an email sent')], db_comment='trigger, application or recorded - mirrored from the declaration.', help_text="What writes the kind's notices: a trigger, the application, or record_email().", max_length=16)),
                ('variants', models.JSONField(blank=True, db_comment='The variants the kind declares. A subscription, endpoint kind or inbox item naming another is refused.', default=list, help_text='The variants the kind declares - the only ones a notice or subscription may name.')),
                ('retired_at', models.DateTimeField(blank=True, db_comment='When the kind was retired, or null. A retired kind writes no more notices.', help_text='When the kind was retired. A retired kind writes no more notices.', null=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('enabled', models.BooleanField(db_comment='Whether the user gets the kind (and variant).', default=True, help_text='Whether the user gets the kind.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='EmailDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='email', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('address', models.CharField(db_comment="The address it's sent to.", help_text="The address it's sent to.", max_length=254)),
                ('user_id', models.CharField(blank=True, db_comment='The primary key of the user the address belongs to, as text, or null.', help_text='The user the address belongs to, or none.', max_length=255, null=True)),
                ('record_key', models.CharField(blank=True, db_comment="record_email()'s key: one email across its sender's tries. Null for one isik sends.", help_text='What its sender named a recorded email by, across its tries - or none.', max_length=255, null=True, unique=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='InboxDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='inbox', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('user_id', models.CharField(db_comment="The primary key of the user whose inbox it lands in, as text, in the delivery's partition.", help_text='The user whose inbox it lands in.', max_length=255)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WebhookDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='webhook', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('endpoint_id', models.CharField(db_comment="The endpoint's primary key, as text, in the delivery's partition. Not a key: it may be deleted.", help_text="The endpoint's primary key.", max_length=255)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='DeliveryAttempt',
            fields=[
                ('attempt_no', models.PositiveIntegerField(db_comment='Which try it was, from 1.', help_text='Which try it was, from 1.')),
                ('request', models.JSONField(blank=True, db_comment='What was sent, after REDACTOR.', default=dict, help_text='What was sent, redacted.')),
                ('response', models.JSONField(blank=True, db_comment='What came back, after REDACTOR, its body cut to MAX_RESPONSE_BYTES. Null when nothing did.', help_text='What came back, redacted and cut short.', null=True)),
                ('status_code', models.PositiveSmallIntegerField(blank=True, db_comment='The HTTP status that came back. Null for a timeout, a refused connection or a non-HTTP channel.', help_text='The HTTP status that came back, or none.', null=True)),
                ('error', models.TextField(blank=True, db_comment='Why it failed, or empty.', default='', help_text='Why it failed, or nothing.')),
                ('succeeded', models.BooleanField(db_comment='Whether it went through.', help_text='Whether it went through.')),
                ('started_at', models.DateTimeField(db_comment='When it began.', help_text='When it began.')),
                ('duration_ms', models.PositiveIntegerField(db_comment='How long it took, in milliseconds.', help_text='How long it took, in milliseconds.')),
                ('triggered_by', models.CharField(db_comment='What started it: send, reap_stranded, or manual.', help_text='What started it - the send task, the reaper, or someone by hand.', max_length=32)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('delivery', models.ForeignKey(db_comment='The delivery tried.', help_text='The delivery tried.', on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Endpoint',
            fields=[
                ('created_at', models.DateTimeField(db_comment="When the row was created, by the database's clock. A trigger refuses any change to it.", db_default=django.db.models.functions.datetime.Now(), db_index=True, editable=False, help_text="When the row was created, by the database's clock. Never changes.", verbose_name='Created At')),
                ('updated_at', models.DateTimeField(db_comment="When the row last changed, by the database's clock. Stamped by a trigger whenever the row changes.", db_default=django.db.models.functions.datetime.Now(), db_index=True, editable=False, help_text="When the row last changed, by the database's clock.", verbose_name='Updated At')),
                ('url', models.URLField(db_comment='Where deliveries are POSTed.', help_text='Where deliveries are POSTed.', max_length=2000, validators=[django.core.validators.URLValidator(schemes=('http', 'https'))])),
                ('secret', models.CharField(db_comment='The secret every delivery is signed with.', help_text='The secret every delivery is signed with.', max_length=255)),
                ('secret_previous', models.CharField(blank=True, db_comment="The secret being rotated out, or null. While it's set, deliveries carry a signature by each.", help_text="The secret being rotated out - deliveries are signed with it too until it's cleared.", max_length=255, null=True)),
                ('is_active', models.BooleanField(db_comment='Whether deliveries are sent to it.', default=True, help_text='Whether deliveries are sent to it.')),
                ('consecutive_failures', models.PositiveIntegerField(db_comment='How many attempts in a row have failed. DISABLE_AFTER of them park it.', default=0, help_text='How many deliveries in a row have failed.')),
                ('parked_at', models.DateTimeField(blank=True, db_comment='When it was parked for failing, or null. Nothing is sent to a parked endpoint.', help_text="When it was parked for failing - nothing is sent to it until it's unparked.", null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('owner', models.ForeignKey(db_comment='The user who registered it, and whose notices it receives.', help_text='The user who registered it, and whose notices it receives.', on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Notice',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="Which of the kind's declared variants happened, or null.", help_text="Which of the kind's variants happened, or none.", max_length=100, null=True)),
                ('subject_label', models.CharField(blank=True, db_comment='The app_label.Model of the row it happened to. Null for a notice no row is behind.', help_text='The model label of the row it happened to, or none.', max_length=200, null=True)),
                ('subject_id', models.CharField(blank=True, db_comment="The row's primary key, as text. Not a key: the row may be deleted, and the record stays.", help_text='The primary key of the row it happened to, or none.', max_length=255, null=True)),
                ('subject_partition', models.TextField(blank=True, db_comment='The partition the subject belongs to. Not a key: a partition may be dropped, and the record stays.', help_text='The partition the row it happened to belongs to, or none.', null=True)),
                ('snapshot', models.JSONField(blank=True, db_comment="The subject's allow-listed columns, as they were after the change. Never another column.", default=dict, help_text="The subject's columns the kind allows, as they were after the change.")),
                ('previous', models.JSONField(blank=True, db_comment='The allow-listed columns as they were before the change. Null unless the kind keeps them.', help_text='The same columns as they were before the change, for an update.', null=True)),
                ('actor_id', models.CharField(blank=True, db_comment='ACTOR_CONTEXT_KEY of the history context the notice was written in, as text, or null.', db_index=True, help_text='Who acted, or none - a migration, a command, a scheduled task.', max_length=255, null=True)),
                ('context', models.JSONField(blank=True, db_comment='NOTICE_CONTEXT_KEYS of the history context the notice was written in - those it held.', default=dict, help_text='What the history context said that the project keeps on its notices.')),
                ('occurred_at', models.DateTimeField(db_comment='When it happened - when its transaction began.', db_default=django.db.models.functions.datetime.Now(), default=django.utils.timezone.now, help_text='When it happened.')),
                ('fanned_out_at', models.DateTimeField(blank=True, db_comment='When its deliveries (or shards) were written. Null is the fan-out queue. Set once.', help_text="When its deliveries were written. Unset, it's waiting to be.", null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_default=models.Func(function='uuidv7'), db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('pgh_context', models.ForeignKey(blank=True, db_comment='The pghistory context the change was made in - shared with the event rows it wrote.', help_text='The history context of the change - who made it, and from where.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='pghistory.context')),
                ('kind', models.ForeignKey(db_comment='What kind of thing happened.', help_text='What kind of thing happened.', on_delete=django.db.models.deletion.PROTECT, related_name='notices', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='FanOutShard',
            fields=[
                ('partition', models.TextField(blank=True, db_comment="The partition's key, as PARTITIONS gives it - null with none. Not a key: a partition may be dropped.", help_text="The partition's key, or none for a project with no partitions.", null=True)),
                ('state', models.CharField(choices=[('pending', 'Pending'), ('claimed', 'Claimed'), ('finished', 'Finished'), ('abandoned', 'Abandoned')], db_comment='pending, claimed (a worker has it), finished or abandoned.', default='pending', help_text='pending, claimed, finished or abandoned.', max_length=16)),
                ('attempt_count', models.PositiveIntegerField(db_comment='How many times a worker has claimed it.', default=0, help_text='How many times a worker has claimed it.')),
                ('next_attempt_at', models.DateTimeField(db_comment="When it's next due to be claimed.", default=django.utils.timezone.now, help_text="When it's next due.")),
                ('claimed_at', models.DateTimeField(blank=True, db_comment='When a worker last claimed it - reap_stranded takes back one claimed too long ago.', help_text='When a worker last claimed it.', null=True)),
                ('claimed_by', models.CharField(blank=True, db_comment='The id of the task that last claimed it.', default='', help_text='The task that last claimed it.', max_length=255)),
                ('finished_at', models.DateTimeField(blank=True, db_comment='When its deliveries were written, or null.', help_text='When its deliveries were written.', null=True)),
                ('last_error', models.TextField(blank=True, db_comment='Why its last claim failed, or empty.', default='', help_text='Why its last claim failed.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('notice', models.ForeignKey(db_comment='The notice reaching the partition.', help_text='The notice reaching the partition.', on_delete=django.db.models.deletion.CASCADE, related_name='shards', to=settings.ISIK_NOTIFICATIONS_NOTICE_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='delivery',
            name='notice',
            field=models.ForeignKey(db_comment='The notice it sends.', help_text='The notice it sends.', on_delete=django.db.models.deletion.CASCADE, related_name='deliveries', to=settings.ISIK_NOTIFICATIONS_NOTICE_MODEL),
        ),
        migrations.CreateModel(
            name='InboxItem',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('subject_label', models.CharField(blank=True, db_comment="The app_label.Model of the row it's about, or null.", help_text="The model label of the row it's about, or none.", max_length=200, null=True)),
                ('subject_id', models.CharField(blank=True, db_comment="The primary key of the row it's about, as text, or null.", help_text="The primary key of the row it's about, or none.", max_length=255, null=True)),
                ('actor_id', models.CharField(blank=True, db_comment='The primary key of who acted, copied from the notice, or null. Not shown to the recipient.', help_text='Who acted, as the notice recorded them, or none.', max_length=255, null=True)),
                ('context', models.JSONField(blank=True, db_comment="The notice's context, copied from it. Not shown to the recipient.", default=dict, help_text='The history context the notice kept, beside who acted.')),
                ('payload', models.JSONField(blank=True, db_comment='What the notice carried: its snapshot, and previous when it kept one.', default=dict, help_text='What the notice carried.')),
                ('read_at', models.DateTimeField(blank=True, db_comment='When the user read it, or null.', help_text='When the user read it.', null=True)),
                ('delivery_id', models.UUIDField(db_comment="The ledger delivery that put it here - unique, so a delivery lands once however often it's tried.", help_text='The delivery that put it here.', unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='When it landed.', help_text='When it landed.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('user', models.ForeignKey(db_comment="The user whose inbox it's in.", help_text="The user whose inbox it's in.", on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('kind', models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='EndpointKind',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('endpoint', models.ForeignKey(db_comment='The endpoint wanting the kind.', help_text='The endpoint wanting the kind.', on_delete=django.db.models.deletion.CASCADE, related_name='kinds', to=settings.ISIK_NOTIFICATIONS_ENDPOINT_MODEL)),
                ('kind', models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='noticekindpolicy',
            trigger=pgtrigger.compiler.Trigger(name='protect_kind', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."kind" IS DISTINCT FROM (NEW."kind"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='0874501c2fb3793573329fd8d8bba93d6c2b22c3', operation='UPDATE', pgid='pgtrigger_protect_kind_dff53', table='notifications_noticekindpolicy', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='noticekindpolicy',
            trigger=pgtrigger.compiler.Trigger(name='protect_policy_delete', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot delete rows from % table', TG_TABLE_NAME;", hash='00dabf000345b16a48c70a31d25ab4657992058c', operation='DELETE', pgid='pgtrigger_protect_policy_delete_b2d9f', table='notifications_noticekindpolicy', when='BEFORE')),
        ),
        migrations.AddField(
            model_name='subscription',
            name='kind',
            field=models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL),
        ),
        migrations.AddField(
            model_name='subscription',
            name='user',
            field=models.ForeignKey(db_comment='The user whose choice this is.', help_text='The user whose choice this is.', on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='deliveryattempt',
            constraint=models.UniqueConstraint(fields=('delivery', 'attempt_no'), name='notifications_deliveryattempt_once'),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='deliveryattempt',
            trigger=pgtrigger.compiler.Trigger(name='append_only', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot update or delete rows from % table', TG_TABLE_NAME;", hash='4121607252bfbe29c596b94ad1cc18083a31fae6', operation='UPDATE OR DELETE', pgid='pgtrigger_append_only_0ace5', table='notifications_deliveryattempt', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='deliveryattempt',
            trigger=pgtrigger.compiler.Trigger(name='protect_attempt_truncate', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot truncate %', TG_TABLE_NAME; RETURN NULL;", hash='7461d5af8a57e0004b08193f34a4e879224652bc', level='STATEMENT', operation='TRUNCATE', pgid='pgtrigger_protect_attempt_truncate_c0940', table='notifications_deliveryattempt', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpoint',
            trigger=pgtrigger.compiler.Trigger(name='protect_created_at', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."created_at" IS DISTINCT FROM (NEW."created_at"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='572b8c6fad23bc827ac3840ffa51ec03e6299002', operation='UPDATE', pgid='pgtrigger_protect_created_at_df8d0', table='notifications_endpoint', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpoint',
            trigger=pgtrigger.compiler.Trigger(name='stamp_updated_at', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF ((OLD."consecutive_failures" IS DISTINCT FROM (NEW."consecutive_failures") OR OLD."created_at" IS DISTINCT FROM (NEW."created_at") OR OLD."id" IS DISTINCT FROM (NEW."id") OR OLD."is_active" IS DISTINCT FROM (NEW."is_active") OR OLD."owner_id" IS DISTINCT FROM (NEW."owner_id") OR OLD."parked_at" IS DISTINCT FROM (NEW."parked_at") OR OLD."secret" IS DISTINCT FROM (NEW."secret") OR OLD."secret_previous" IS DISTINCT FROM (NEW."secret_previous") OR OLD."url" IS DISTINCT FROM (NEW."url"))) OR NEW."updated_at" > OLD."updated_at" THEN NEW."updated_at" = GREATEST(clock_timestamp(), OLD."updated_at" + interval \'1 microsecond\'); ELSE NEW."updated_at" = OLD."updated_at"; END IF; RETURN NEW;', hash='9909b436ad7ca5cefa9ca262e967e819c2ba4a24', operation='UPDATE', pgid='pgtrigger_stamp_updated_at_d72da', table='notifications_endpoint', when='BEFORE')),
        ),
        migrations.AddIndex(
            model_name='fanoutshard',
            index=models.Index(condition=models.Q(('finished_at__isnull', True)), fields=['next_attempt_at'], name='shard_unfinished_877847a0'),
        ),
        migrations.AddConstraint(
            model_name='fanoutshard',
            constraint=models.UniqueConstraint(fields=('notice', 'partition'), name='notifications_fanoutshard_once'),
        ),
        migrations.AddIndex(
            model_name='delivery',
            index=models.Index(condition=models.Q(('state', 'pending')), fields=['next_attempt_at'], name='delivery_due_7ae8f2ff'),
        ),
        migrations.AddConstraint(
            model_name='delivery',
            constraint=models.UniqueConstraint(fields=('notice', 'channel', 'target_key'), name='notifications_delivery_once'),
        ),
        migrations.AddIndex(
            model_name='notice',
            index=models.Index(condition=models.Q(('fanned_out_at__isnull', True)), fields=['occurred_at'], name='notice_unfanned_f6b7e5d2'),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_update', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."actor_id" IS DISTINCT FROM (NEW."actor_id") OR OLD."context" IS DISTINCT FROM (NEW."context") OR OLD."id" IS DISTINCT FROM (NEW."id") OR OLD."kind_id" IS DISTINCT FROM (NEW."kind_id") OR OLD."occurred_at" IS DISTINCT FROM (NEW."occurred_at") OR OLD."pgh_context_id" IS DISTINCT FROM (NEW."pgh_context_id") OR OLD."previous" IS DISTINCT FROM (NEW."previous") OR OLD."snapshot" IS DISTINCT FROM (NEW."snapshot") OR OLD."subject_id" IS DISTINCT FROM (NEW."subject_id") OR OLD."subject_label" IS DISTINCT FROM (NEW."subject_label") OR OLD."subject_partition" IS DISTINCT FROM (NEW."subject_partition") OR OLD."variant" IS DISTINCT FROM (NEW."variant"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='d0abe29ca651bb7ae805674e51db5376406c7b9f', operation='UPDATE', pgid='pgtrigger_protect_notice_update_0b8ed', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='fanned_out_once', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."fanned_out_at" IS NOT NULL OR NEW."fanned_out_at" IS NULL)', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='113fd360941d312aff1602d9f0544b191c46548c', operation='UPDATE', pgid='pgtrigger_fanned_out_once_8587a', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_delete', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot delete rows from % table', TG_TABLE_NAME;", hash='443acab79267cfe01aa867e348e4183c7637adce', operation='DELETE', pgid='pgtrigger_protect_notice_delete_973b0', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_truncate', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot truncate %', TG_TABLE_NAME; RETURN NULL;", hash='d7fe219a59f4a4a65b579c477d518b6aba0a4849', level='STATEMENT', operation='TRUNCATE', pgid='pgtrigger_protect_notice_truncate_0115d', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='inboxitem',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.InboxItem: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.InboxItem: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='9ae24bf1046c1df20a44e9cfdc7bb7069ee8a586', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_93a13', table='notifications_inboxitem', when='BEFORE')),
        ),
        migrations.AddConstraint(
            model_name='endpointkind',
            constraint=models.UniqueConstraint(fields=('endpoint', 'kind', 'variant'), name='notifications_endpointkind_once', nulls_distinct=False),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpointkind',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.EndpointKind: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.EndpointKind: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; PERFORM pg_advisory_xact_lock(hashtext(\'notifications_endpointkind\'), hashtext(NEW."endpoint_id"::text || \':\' || NEW."kind_id"::text)); IF EXISTS (SELECT 1 FROM "notifications_endpointkind" WHERE "endpoint_id" = NEW."endpoint_id" AND "kind_id" = NEW."kind_id" AND "id" IS DISTINCT FROM NEW."id" AND ("variant" IS NULL) <> (NEW."variant" IS NULL)) THEN RAISE EXCEPTION \'notifications.EndpointKind: a row naming no variant, which covers every one, cannot sit beside one naming a variant for the same endpoint and kind.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='f493c1b8bc6233796db47d9de91d81e677ad1766', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_8f20c', table='notifications_endpointkind', when='BEFORE')),
        ),
        migrations.AddConstraint(
            model_name='subscription',
            constraint=models.UniqueConstraint(fields=('user', 'kind', 'variant'), name='notifications_subscription_once', nulls_distinct=False),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='subscription',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.Subscription: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.Subscription: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; PERFORM pg_advisory_xact_lock(hashtext(\'notifications_subscription\'), hashtext(NEW."user_id"::text || \':\' || NEW."kind_id"::text)); IF EXISTS (SELECT 1 FROM "notifications_subscription" WHERE "user_id" = NEW."user_id" AND "kind_id" = NEW."kind_id" AND "id" IS DISTINCT FROM NEW."id" AND ("variant" IS NULL) <> (NEW."variant" IS NULL)) THEN RAISE EXCEPTION \'notifications.Subscription: a row naming no variant, which covers every one, cannot sit beside one naming a variant for the same user and kind.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='92b0f022f3161b213aee4d7a364c6d57bd38e74c', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_a22c8', table='notifications_subscription', when='BEFORE')),
        ),
    ]
{%- else %}

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.datetime
import django.utils.timezone
import isik.django.apps.common.db.models
import pgtrigger.compiler
import pgtrigger.migrations
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('pghistory', '0007_auto_20250421_0444'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Delivery',
            fields=[
                ('channel', models.CharField(db_comment="The registered channel it goes out on - inbox, email, webhook, or a project's own.", help_text='The channel it goes out on.', max_length=32)),
                ('partition', models.TextField(blank=True, db_comment='The partition its target lives in. Null when the project declares no partitions.', help_text='The partition its target lives in, or none.', null=True)),
                ('target_key', models.CharField(db_comment='Its target as one opaque key, unique per notice and channel.', help_text='Its target, as one key - what keeps a notice from reaching one target twice.', max_length=255)),
                ('state', models.CharField(choices=[('pending', 'Pending'), ('sending', 'Sending'), ('sent', 'Sent'), ('abandoned', 'Abandoned')], db_comment='pending (due at next_attempt_at), sending, sent or abandoned.', default='pending', help_text='pending, sending, sent or abandoned.', max_length=16)),
                ('attempt_count', models.PositiveIntegerField(db_comment="How many times it's been tried, in every run.", default=0, help_text="How many times it's been tried.")),
                ('attempts_before_run', models.PositiveIntegerField(db_comment='attempt_count when the current run began - a manual retry starts one. MAX_ATTEMPTS counts from it.', default=0, help_text='How many times it had been tried when its current run began.')),
                ('retry_trigger', models.CharField(blank=True, db_comment="What asked for its next attempt - manual - or empty. The attempt records it, and it's cleared.", default='', help_text="What asked for its next attempt, when it wasn't the send task.", max_length=32)),
                ('next_attempt_at', models.DateTimeField(db_comment="When it's next due to be tried.", default=django.utils.timezone.now, help_text="When it's next due.")),
                ('claimed_at', models.DateTimeField(blank=True, db_comment='When a worker last took it to send - reap_stranded takes back one sending too long.', help_text='When a worker last took it to send.', null=True)),
                ('sent_at', models.DateTimeField(blank=True, db_comment='When it was sent, or null.', help_text='When it was sent.', null=True)),
                ('created_at', models.DateTimeField(db_comment='When it was written.', db_default=django.db.models.functions.datetime.Now(), default=django.utils.timezone.now, help_text='When it was written.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Endpoint',
            fields=[
                ('created_at', models.DateTimeField(db_comment="When the row was created, by the database's clock. A trigger refuses any change to it.", db_default=django.db.models.functions.datetime.Now(), db_index=True, editable=False, help_text="When the row was created, by the database's clock. Never changes.", verbose_name='Created At')),
                ('updated_at', models.DateTimeField(db_comment="When the row last changed, by the database's clock. Stamped by a trigger whenever the row changes.", db_default=django.db.models.functions.datetime.Now(), db_index=True, editable=False, help_text="When the row last changed, by the database's clock.", verbose_name='Updated At')),
                ('url', models.URLField(db_comment='Where deliveries are POSTed.', help_text='Where deliveries are POSTed.', max_length=2000, validators=[django.core.validators.URLValidator(schemes=('http', 'https'))])),
                ('secret', models.CharField(db_comment='The secret every delivery is signed with.', help_text='The secret every delivery is signed with.', max_length=255)),
                ('secret_previous', models.CharField(blank=True, db_comment="The secret being rotated out, or null. While it's set, deliveries carry a signature by each.", help_text="The secret being rotated out - deliveries are signed with it too until it's cleared.", max_length=255, null=True)),
                ('is_active', models.BooleanField(db_comment='Whether deliveries are sent to it.', default=True, help_text='Whether deliveries are sent to it.')),
                ('consecutive_failures', models.PositiveIntegerField(db_comment='How many attempts in a row have failed. DISABLE_AFTER of them park it.', default=0, help_text='How many deliveries in a row have failed.')),
                ('parked_at', models.DateTimeField(blank=True, db_comment='When it was parked for failing, or null. Nothing is sent to a parked endpoint.', help_text="When it was parked for failing - nothing is sent to it until it's unparked.", null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='EndpointKind',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='FanOutShard',
            fields=[
                ('partition', models.TextField(blank=True, db_comment="The partition's key, as PARTITIONS gives it - null with none. Not a key: a partition may be dropped.", help_text="The partition's key, or none for a project with no partitions.", null=True)),
                ('state', models.CharField(choices=[('pending', 'Pending'), ('claimed', 'Claimed'), ('finished', 'Finished'), ('abandoned', 'Abandoned')], db_comment='pending, claimed (a worker has it), finished or abandoned.', default='pending', help_text='pending, claimed, finished or abandoned.', max_length=16)),
                ('attempt_count', models.PositiveIntegerField(db_comment='How many times a worker has claimed it.', default=0, help_text='How many times a worker has claimed it.')),
                ('next_attempt_at', models.DateTimeField(db_comment="When it's next due to be claimed.", default=django.utils.timezone.now, help_text="When it's next due.")),
                ('claimed_at', models.DateTimeField(blank=True, db_comment='When a worker last claimed it - reap_stranded takes back one claimed too long ago.', help_text='When a worker last claimed it.', null=True)),
                ('claimed_by', models.CharField(blank=True, db_comment='The id of the task that last claimed it.', default='', help_text='The task that last claimed it.', max_length=255)),
                ('finished_at', models.DateTimeField(blank=True, db_comment='When its deliveries were written, or null.', help_text='When its deliveries were written.', null=True)),
                ('last_error', models.TextField(blank=True, db_comment='Why its last claim failed, or empty.', default='', help_text='Why its last claim failed.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='InboxItem',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('subject_label', models.CharField(blank=True, db_comment="The app_label.Model of the row it's about, or null.", help_text="The model label of the row it's about, or none.", max_length=200, null=True)),
                ('subject_id', models.CharField(blank=True, db_comment="The primary key of the row it's about, as text, or null.", help_text="The primary key of the row it's about, or none.", max_length=255, null=True)),
                ('actor_id', models.CharField(blank=True, db_comment='The primary key of who acted, copied from the notice, or null. Not shown to the recipient.', help_text='Who acted, as the notice recorded them, or none.', max_length=255, null=True)),
                ('context', models.JSONField(blank=True, db_comment="The notice's context, copied from it. Not shown to the recipient.", default=dict, help_text='The history context the notice kept, beside who acted.')),
                ('payload', models.JSONField(blank=True, db_comment='What the notice carried: its snapshot, and previous when it kept one.', default=dict, help_text='What the notice carried.')),
                ('read_at', models.DateTimeField(blank=True, db_comment='When the user read it, or null.', help_text='When the user read it.', null=True)),
                ('delivery_id', models.UUIDField(db_comment="The ledger delivery that put it here - unique, so a delivery lands once however often it's tried.", help_text='The delivery that put it here.', unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='When it landed.', help_text='When it landed.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'ordering': ['-created_at'],
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Notice',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="Which of the kind's declared variants happened, or null.", help_text="Which of the kind's variants happened, or none.", max_length=100, null=True)),
                ('subject_label', models.CharField(blank=True, db_comment='The app_label.Model of the row it happened to. Null for a notice no row is behind.', help_text='The model label of the row it happened to, or none.', max_length=200, null=True)),
                ('subject_id', models.CharField(blank=True, db_comment="The row's primary key, as text. Not a key: the row may be deleted, and the record stays.", help_text='The primary key of the row it happened to, or none.', max_length=255, null=True)),
                ('subject_partition', models.TextField(blank=True, db_comment='The partition the subject belongs to. Not a key: a partition may be dropped, and the record stays.', help_text='The partition the row it happened to belongs to, or none.', null=True)),
                ('snapshot', models.JSONField(blank=True, db_comment="The subject's allow-listed columns, as they were after the change. Never another column.", default=dict, help_text="The subject's columns the kind allows, as they were after the change.")),
                ('previous', models.JSONField(blank=True, db_comment='The allow-listed columns as they were before the change. Null unless the kind keeps them.', help_text='The same columns as they were before the change, for an update.', null=True)),
                ('actor_id', models.CharField(blank=True, db_comment='ACTOR_CONTEXT_KEY of the history context the notice was written in, as text, or null.', db_index=True, help_text='Who acted, or none - a migration, a command, a scheduled task.', max_length=255, null=True)),
                ('context', models.JSONField(blank=True, db_comment='NOTICE_CONTEXT_KEYS of the history context the notice was written in - those it held.', default=dict, help_text='What the history context said that the project keeps on its notices.')),
                ('occurred_at', models.DateTimeField(db_comment='When it happened - when its transaction began.', db_default=django.db.models.functions.datetime.Now(), default=django.utils.timezone.now, help_text='When it happened.')),
                ('fanned_out_at', models.DateTimeField(blank=True, db_comment='When its deliveries (or shards) were written. Null is the fan-out queue. Set once.', help_text="When its deliveries were written. Unset, it's waiting to be.", null=True)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_default=models.Func(function='uuidv7'), db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='NoticeKindPolicy',
            fields=[
                ('kind', models.CharField(db_comment="The kind's name, as its declaration gives it. Never changes.", help_text="The kind's name, as its declaration gives it.", max_length=100, primary_key=True, serialize=False)),
                ('policy', models.CharField(choices=[('mandatory', 'Mandatory'), ('default_on', 'On unless turned off'), ('default_off', 'Off unless turned on')], db_comment='mandatory, default_on or default_off - mirrored from the declaration.', help_text='Who gets the kind: everyone its audience names, opted-out aside, or only the opted-in.', max_length=16)),
                ('scope', models.CharField(choices=[('single_partition', 'One partition'), ('cross_partition', 'Many partitions')], db_comment='single_partition or cross_partition - mirrored from the declaration.', help_text="Whether the kind's audience lives in one partition or many.", max_length=16)),
                ('source', models.CharField(choices=[('trigger', 'A trigger'), ('application', 'The application'), ('recorded', 'A record of an email sent')], db_comment='trigger, application or recorded - mirrored from the declaration.', help_text="What writes the kind's notices: a trigger, the application, or record_email().", max_length=16)),
                ('variants', models.JSONField(blank=True, db_comment='The variants the kind declares. A subscription, endpoint kind or inbox item naming another is refused.', default=list, help_text='The variants the kind declares - the only ones a notice or subscription may name.')),
                ('retired_at', models.DateTimeField(blank=True, db_comment='When the kind was retired, or null. A retired kind writes no more notices.', help_text='When the kind was retired. A retired kind writes no more notices.', null=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('variant', models.CharField(blank=True, db_comment="The kind's declared variant this is for, or null for every variant.", help_text="The kind's one variant this is for, or none for every one.", max_length=100, null=True)),
                ('enabled', models.BooleanField(db_comment='Whether the user gets the kind (and variant).', default=True, help_text='Whether the user gets the kind.')),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='EmailDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='email', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('address', models.CharField(db_comment="The address it's sent to.", help_text="The address it's sent to.", max_length=254)),
                ('user_id', models.CharField(blank=True, db_comment='The primary key of the user the address belongs to, as text, or null.', help_text='The user the address belongs to, or none.', max_length=255, null=True)),
                ('record_key', models.CharField(blank=True, db_comment="record_email()'s key: one email across its sender's tries. Null for one isik sends.", help_text='What its sender named a recorded email by, across its tries - or none.', max_length=255, null=True, unique=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='InboxDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='inbox', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('user_id', models.CharField(db_comment="The primary key of the user whose inbox it lands in, as text, in the delivery's partition.", help_text='The user whose inbox it lands in.', max_length=255)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WebhookDelivery',
            fields=[
                ('delivery', models.OneToOneField(db_comment='The delivery this is the target of.', help_text='The delivery this is the target of.', on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='webhook', serialize=False, to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
                ('endpoint_id', models.CharField(db_comment="The endpoint's primary key, as text, in the delivery's partition. Not a key: it may be deleted.", help_text="The endpoint's primary key.", max_length=255)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='DeliveryAttempt',
            fields=[
                ('attempt_no', models.PositiveIntegerField(db_comment='Which try it was, from 1.', help_text='Which try it was, from 1.')),
                ('request', models.JSONField(blank=True, db_comment='What was sent, after REDACTOR.', default=dict, help_text='What was sent, redacted.')),
                ('response', models.JSONField(blank=True, db_comment='What came back, after REDACTOR, its body cut to MAX_RESPONSE_BYTES. Null when nothing did.', help_text='What came back, redacted and cut short.', null=True)),
                ('status_code', models.PositiveSmallIntegerField(blank=True, db_comment='The HTTP status that came back. Null for a timeout, a refused connection or a non-HTTP channel.', help_text='The HTTP status that came back, or none.', null=True)),
                ('error', models.TextField(blank=True, db_comment='Why it failed, or empty.', default='', help_text='Why it failed, or nothing.')),
                ('succeeded', models.BooleanField(db_comment='Whether it went through.', help_text='Whether it went through.')),
                ('started_at', models.DateTimeField(db_comment='When it began.', help_text='When it began.')),
                ('duration_ms', models.PositiveIntegerField(db_comment='How long it took, in milliseconds.', help_text='How long it took, in milliseconds.')),
                ('triggered_by', models.CharField(db_comment='What started it: send, reap_stranded, or manual.', help_text='What started it - the send task, the reaper, or someone by hand.', max_length=32)),
                ('id', models.UUIDField(db_comment='Primary key: a UUIDv7 the application generates, so ids sort roughly by creation time.', db_index=True, default=isik.django.apps.common.db.models.new_primary_key, editable=False, help_text='Identifies this record. A UUIDv7, so ids sort roughly by when they were created.', primary_key=True, serialize=False, verbose_name='ID')),
                ('delivery', models.ForeignKey(db_comment='The delivery tried.', help_text='The delivery tried.', on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to=settings.ISIK_NOTIFICATIONS_DELIVERY_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpoint',
            trigger=pgtrigger.compiler.Trigger(name='protect_created_at', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."created_at" IS DISTINCT FROM (NEW."created_at"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='572b8c6fad23bc827ac3840ffa51ec03e6299002', operation='UPDATE', pgid='pgtrigger_protect_created_at_df8d0', table='notifications_endpoint', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpoint',
            trigger=pgtrigger.compiler.Trigger(name='stamp_updated_at', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF ((OLD."consecutive_failures" IS DISTINCT FROM (NEW."consecutive_failures") OR OLD."created_at" IS DISTINCT FROM (NEW."created_at") OR OLD."id" IS DISTINCT FROM (NEW."id") OR OLD."is_active" IS DISTINCT FROM (NEW."is_active") OR OLD."parked_at" IS DISTINCT FROM (NEW."parked_at") OR OLD."secret" IS DISTINCT FROM (NEW."secret") OR OLD."secret_previous" IS DISTINCT FROM (NEW."secret_previous") OR OLD."url" IS DISTINCT FROM (NEW."url"))) OR NEW."updated_at" > OLD."updated_at" THEN NEW."updated_at" = GREATEST(clock_timestamp(), OLD."updated_at" + interval \'1 microsecond\'); ELSE NEW."updated_at" = OLD."updated_at"; END IF; RETURN NEW;', hash='50768766221d7132292faf5fb1b10a90375fb688', operation='UPDATE', pgid='pgtrigger_stamp_updated_at_d72da', table='notifications_endpoint', when='BEFORE')),
        ),
        migrations.AddField(
            model_name='endpointkind',
            name='endpoint',
            field=models.ForeignKey(db_comment='The endpoint wanting the kind.', help_text='The endpoint wanting the kind.', on_delete=django.db.models.deletion.CASCADE, related_name='kinds', to=settings.ISIK_NOTIFICATIONS_ENDPOINT_MODEL),
        ),
        migrations.AddField(
            model_name='inboxitem',
            name='user',
            field=models.ForeignKey(db_comment="The user whose inbox it's in.", help_text="The user whose inbox it's in.", on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='notice',
            name='pgh_context',
            field=models.ForeignKey(blank=True, db_comment='The pghistory context the change was made in - shared with the event rows it wrote.', help_text='The history context of the change - who made it, and from where.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='pghistory.context'),
        ),
        migrations.AddField(
            model_name='fanoutshard',
            name='notice',
            field=models.ForeignKey(db_comment='The notice reaching the partition.', help_text='The notice reaching the partition.', on_delete=django.db.models.deletion.CASCADE, related_name='shards', to=settings.ISIK_NOTIFICATIONS_NOTICE_MODEL),
        ),
        migrations.AddField(
            model_name='delivery',
            name='notice',
            field=models.ForeignKey(db_comment='The notice it sends.', help_text='The notice it sends.', on_delete=django.db.models.deletion.CASCADE, related_name='deliveries', to=settings.ISIK_NOTIFICATIONS_NOTICE_MODEL),
        ),
        migrations.AddField(
            model_name='notice',
            name='kind',
            field=models.ForeignKey(db_comment='What kind of thing happened.', help_text='What kind of thing happened.', on_delete=django.db.models.deletion.PROTECT, related_name='notices', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL),
        ),
        migrations.AddField(
            model_name='inboxitem',
            name='kind',
            field=models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL),
        ),
        migrations.AddField(
            model_name='endpointkind',
            name='kind',
            field=models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='noticekindpolicy',
            trigger=pgtrigger.compiler.Trigger(name='protect_kind', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."kind" IS DISTINCT FROM (NEW."kind"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='0874501c2fb3793573329fd8d8bba93d6c2b22c3', operation='UPDATE', pgid='pgtrigger_protect_kind_dff53', table='notifications_noticekindpolicy', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='noticekindpolicy',
            trigger=pgtrigger.compiler.Trigger(name='protect_policy_delete', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot delete rows from % table', TG_TABLE_NAME;", hash='00dabf000345b16a48c70a31d25ab4657992058c', operation='DELETE', pgid='pgtrigger_protect_policy_delete_b2d9f', table='notifications_noticekindpolicy', when='BEFORE')),
        ),
        migrations.AddField(
            model_name='subscription',
            name='kind',
            field=models.ForeignKey(db_comment="The kind it's for. Kinds are retired, never deleted.", help_text="The kind it's for.", on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.ISIK_NOTIFICATIONS_KIND_POLICY_MODEL),
        ),
        migrations.AddField(
            model_name='subscription',
            name='user',
            field=models.ForeignKey(db_comment='The user whose choice this is.', help_text='The user whose choice this is.', on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='deliveryattempt',
            constraint=models.UniqueConstraint(fields=('delivery', 'attempt_no'), name='notifications_deliveryattempt_once'),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='deliveryattempt',
            trigger=pgtrigger.compiler.Trigger(name='append_only', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot update or delete rows from % table', TG_TABLE_NAME;", hash='4121607252bfbe29c596b94ad1cc18083a31fae6', operation='UPDATE OR DELETE', pgid='pgtrigger_append_only_0ace5', table='notifications_deliveryattempt', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='deliveryattempt',
            trigger=pgtrigger.compiler.Trigger(name='protect_attempt_truncate', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot truncate %', TG_TABLE_NAME; RETURN NULL;", hash='7461d5af8a57e0004b08193f34a4e879224652bc', level='STATEMENT', operation='TRUNCATE', pgid='pgtrigger_protect_attempt_truncate_c0940', table='notifications_deliveryattempt', when='BEFORE')),
        ),
        migrations.AddIndex(
            model_name='fanoutshard',
            index=models.Index(condition=models.Q(('finished_at__isnull', True)), fields=['next_attempt_at'], name='shard_unfinished_877847a0'),
        ),
        migrations.AddConstraint(
            model_name='fanoutshard',
            constraint=models.UniqueConstraint(fields=('notice', 'partition'), name='notifications_fanoutshard_once'),
        ),
        migrations.AddIndex(
            model_name='delivery',
            index=models.Index(condition=models.Q(('state', 'pending')), fields=['next_attempt_at'], name='delivery_due_7ae8f2ff'),
        ),
        migrations.AddConstraint(
            model_name='delivery',
            constraint=models.UniqueConstraint(fields=('notice', 'channel', 'target_key'), name='notifications_delivery_once'),
        ),
        migrations.AddIndex(
            model_name='notice',
            index=models.Index(condition=models.Q(('fanned_out_at__isnull', True)), fields=['occurred_at'], name='notice_unfanned_f6b7e5d2'),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_update', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."actor_id" IS DISTINCT FROM (NEW."actor_id") OR OLD."context" IS DISTINCT FROM (NEW."context") OR OLD."id" IS DISTINCT FROM (NEW."id") OR OLD."kind_id" IS DISTINCT FROM (NEW."kind_id") OR OLD."occurred_at" IS DISTINCT FROM (NEW."occurred_at") OR OLD."pgh_context_id" IS DISTINCT FROM (NEW."pgh_context_id") OR OLD."previous" IS DISTINCT FROM (NEW."previous") OR OLD."snapshot" IS DISTINCT FROM (NEW."snapshot") OR OLD."subject_id" IS DISTINCT FROM (NEW."subject_id") OR OLD."subject_label" IS DISTINCT FROM (NEW."subject_label") OR OLD."subject_partition" IS DISTINCT FROM (NEW."subject_partition") OR OLD."variant" IS DISTINCT FROM (NEW."variant"))', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='d0abe29ca651bb7ae805674e51db5376406c7b9f', operation='UPDATE', pgid='pgtrigger_protect_notice_update_0b8ed', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='fanned_out_once', sql=pgtrigger.compiler.UpsertTriggerSql(condition='WHEN (OLD."fanned_out_at" IS NOT NULL OR NEW."fanned_out_at" IS NULL)', func="RAISE EXCEPTION 'pgtrigger: Cannot update rows from % table', TG_TABLE_NAME;", hash='113fd360941d312aff1602d9f0544b191c46548c', operation='UPDATE', pgid='pgtrigger_fanned_out_once_8587a', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_delete', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot delete rows from % table', TG_TABLE_NAME;", hash='443acab79267cfe01aa867e348e4183c7637adce', operation='DELETE', pgid='pgtrigger_protect_notice_delete_973b0', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='notice',
            trigger=pgtrigger.compiler.Trigger(name='protect_notice_truncate', sql=pgtrigger.compiler.UpsertTriggerSql(func="RAISE EXCEPTION 'pgtrigger: Cannot truncate %', TG_TABLE_NAME; RETURN NULL;", hash='d7fe219a59f4a4a65b579c477d518b6aba0a4849', level='STATEMENT', operation='TRUNCATE', pgid='pgtrigger_protect_notice_truncate_0115d', table='notifications_notice', when='BEFORE')),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='inboxitem',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.InboxItem: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.InboxItem: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='9ae24bf1046c1df20a44e9cfdc7bb7069ee8a586', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_93a13', table='notifications_inboxitem', when='BEFORE')),
        ),
        migrations.AddConstraint(
            model_name='endpointkind',
            constraint=models.UniqueConstraint(fields=('endpoint', 'kind', 'variant'), name='notifications_endpointkind_once', nulls_distinct=False),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='endpointkind',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.EndpointKind: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.EndpointKind: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; PERFORM pg_advisory_xact_lock(hashtext(\'notifications_endpointkind\'), hashtext(NEW."endpoint_id"::text || \':\' || NEW."kind_id"::text)); IF EXISTS (SELECT 1 FROM "notifications_endpointkind" WHERE "endpoint_id" = NEW."endpoint_id" AND "kind_id" = NEW."kind_id" AND "id" IS DISTINCT FROM NEW."id" AND ("variant" IS NULL) <> (NEW."variant" IS NULL)) THEN RAISE EXCEPTION \'notifications.EndpointKind: a row naming no variant, which covers every one, cannot sit beside one naming a variant for the same endpoint and kind.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='f493c1b8bc6233796db47d9de91d81e677ad1766', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_8f20c', table='notifications_endpointkind', when='BEFORE')),
        ),
        migrations.AddConstraint(
            model_name='subscription',
            constraint=models.UniqueConstraint(fields=('user', 'kind', 'variant'), name='notifications_subscription_once', nulls_distinct=False),
        ),
        pgtrigger.migrations.AddTrigger(
            model_name='subscription',
            trigger=pgtrigger.compiler.Trigger(name='guard_variant', sql=pgtrigger.compiler.UpsertTriggerSql(func='IF NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id") THEN RAISE EXCEPTION \'notifications.Subscription: no kind is called that.\' USING ERRCODE = \'check_violation\'; END IF; IF NEW."variant" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "notifications_noticekindpolicy" WHERE "kind" = NEW."kind_id" AND "variants" @> jsonb_build_array(NEW."variant")) THEN RAISE EXCEPTION \'notifications.Subscription: the kind declares no such variant.\' USING ERRCODE = \'check_violation\'; END IF; PERFORM pg_advisory_xact_lock(hashtext(\'notifications_subscription\'), hashtext(NEW."user_id"::text || \':\' || NEW."kind_id"::text)); IF EXISTS (SELECT 1 FROM "notifications_subscription" WHERE "user_id" = NEW."user_id" AND "kind_id" = NEW."kind_id" AND "id" IS DISTINCT FROM NEW."id" AND ("variant" IS NULL) <> (NEW."variant" IS NULL)) THEN RAISE EXCEPTION \'notifications.Subscription: a row naming no variant, which covers every one, cannot sit beside one naming a variant for the same user and kind.\' USING ERRCODE = \'check_violation\'; END IF; RETURN NEW;', hash='92b0f022f3161b213aee4d7a364c6d57bd38e74c', operation='INSERT OR UPDATE', pgid='pgtrigger_guard_variant_a22c8', table='notifications_subscription', when='BEFORE')),
        ),
    ]
{%- endif %}

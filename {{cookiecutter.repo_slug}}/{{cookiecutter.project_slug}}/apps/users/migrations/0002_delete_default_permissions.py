from django.db import migrations


DEFAULT_ACTIONS = ("add", "change", "delete", "view")


def delete_default_permissions(apps, schema_editor):
    """Drops what create_permissions() already minted before UsersConfig.ready() started
    disconnecting it. Matches each codename against its own content type rather than by prefix, so
    a hand-authored permission that happens to start with view_/add_/... is left alone."""
    Permission = apps.get_model("auth", "Permission")
    generated = [
        permission.pk
        for permission in Permission.objects.select_related("content_type")
        if permission.codename in {f"{action}_{permission.content_type.model}" for action in DEFAULT_ACTIONS}
    ]
    Permission.objects.filter(pk__in=generated).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        # No reverse: putting these back means reconnecting the receiver ready() drops, which is a
        # code change rather than a data one. Elidable because a squash is replayed onto a database
        # that never had these rows - ready() disconnects before the first migrate can create them.
        migrations.RunPython(delete_default_permissions, migrations.RunPython.noop, elidable=True),
    ]

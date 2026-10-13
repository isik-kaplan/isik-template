"""The scope ceiling, enforced in the database.

There as well as in the API because a many-to-many is writable from a shell, a migration or any view that
forgets - and one approved scope outside the request makes the review decorative.
"""

from apps.common.db import model_db_column, model_db_name


WITHIN_REQUESTED_DECLARE = [("was_requested", "boolean")]


def approved_within_requested(model):
    """A superuser can only approve something the application asked for."""
    from apps.oauth_provider.models import Application

    requested = Application.requested_scopes.through
    return f"""
    SELECT EXISTS (
        SELECT 1 FROM {model_db_name(requested)} r
        WHERE r.{model_db_column(requested, "application")} = NEW.{model_db_column(model, "application")}
            AND r.{model_db_column(requested, "permission")} = NEW.{model_db_column(model, "permission")}
    ) INTO was_requested;
    IF NOT was_requested THEN
        RAISE EXCEPTION 'pgtrigger: approved scope % was never requested',
            NEW.{model_db_column(model, "permission")};
    END IF;
    RETURN NEW;
"""

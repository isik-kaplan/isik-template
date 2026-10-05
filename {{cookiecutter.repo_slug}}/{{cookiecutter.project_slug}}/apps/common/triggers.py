"""A trigger whose body is built when the SQL is compiled, not when the class is defined.

Compile time is the first point where another app's models are reliably importable, and the only one
where a table or column name can come from `_meta` rather than be spelled out.

`build` is handed the *migration-state* model, which carries `_meta` and nothing else, so anything
beyond a table or column name has to import the real class inside the builder.
"""

import pgtrigger


class BuiltTrigger(pgtrigger.Trigger):
    """Takes `build`, a callable receiving the model and returning the SQL body."""

    def __init__(self, *, build, **kwargs):
        self.build = build
        super().__init__(**kwargs)

    def get_func(self, model):
        return self.build(model)

"""A trigger body built at SQL compile time, when names can come from `_meta` rather than be spelled out.

`build` gets the migration-state model, which has only `_meta`; anything more must import the real class.
"""

import pgtrigger


class BuiltTrigger(pgtrigger.Trigger):
    def __init__(self, *, build, **kwargs):
        self.build = build
        super().__init__(**kwargs)

    def get_func(self, model):
        return self.build(model)

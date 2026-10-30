from isik.django.apps.notifications import bases


class NoticeKindPolicy(bases.AbstractNoticeKindPolicy):
    class Meta(bases.AbstractNoticeKindPolicy.Meta):
        db_table = "notifications_notice_kind_policy"

from apps.common.api.routers import AppRouter
from apps.scheduling.api.viewsets.scheduled_task import ScheduledTaskViewSet


app_name = "scheduling"

router = AppRouter()
router.register("scheduled-tasks", ScheduledTaskViewSet, basename=ScheduledTaskViewSet.endpoint)

urlpatterns = router.urls

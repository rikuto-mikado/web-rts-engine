from django.db.models import Count, Q, Sum
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import Campaign, Commander, Scenario, UnitType
from .serializers import (
    BattleReportSerializer,
    CampaignSerializer,
    CommanderSerializer,
    ScenarioSerializer,
    UnitTypeSerializer,
)


@api_view(["GET"])
def health(request):
    return Response({"ok": True})


@api_view(["GET"])
def content(request):
    """Everything the client needs to start a game, in one request."""
    return Response(
        {
            "unit_types": UnitTypeSerializer(UnitType.objects.all(), many=True).data,
            "commanders": CommanderSerializer(Commander.objects.all(), many=True).data,
            "scenarios": ScenarioSerializer(Scenario.objects.all(), many=True).data,
        }
    )


class CampaignViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Match records. There are no accounts, so the API is deliberately narrow:
    create a match, read it, patch its result, add battle reports. Listing,
    full replacement (PUT) and deletion are not exposed."""

    queryset = Campaign.objects.select_related("scenario")
    serializer_class = CampaignSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=True, methods=["get", "post"], url_path="battle-reports")
    def battle_reports(self, request, pk=None):
        campaign = self.get_object()
        if request.method == "POST":
            serializer = BattleReportSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(campaign=campaign)
            return Response(serializer.data, status=201)
        reports = campaign.battle_reports.all()[:200]
        return Response(BattleReportSerializer(reports, many=True).data)

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        campaign = self.get_object()
        agg = campaign.battle_reports.aggregate(
            battles=Count("id"),
            won=Count("id", filter=Q(outcome__in=["victory", "retreat", "captured"])),
            lost=Count("id", filter=Q(outcome__in=["defeat", "withdrew", "lost"])),
            player_losses=Sum("player_losses"),
            enemy_losses=Sum("enemy_losses"),
        )
        return Response({k: v or 0 for k, v in agg.items()})

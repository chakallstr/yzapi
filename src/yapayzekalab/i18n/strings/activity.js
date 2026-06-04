/* tab-activity.jsx strings. { tr: {...}, en: {...} } with parity. */
export default {
  tr: {
    /* ── HeatGrid ── */
    'activity.heatgrid.tooltip': '{label} · {requestCount} istek',
    'activity.heatgrid.tooltip.errors': '{label} · {requestCount} istek · {errorCount} hata',
    'activity.heatgrid.cell.errors': 'hata {errorCount}',

    /* ── ProviderDonut ── */
    'activity.donut.requests': 'istek',

    /* ── StatusBadge ── */
    'activity.status.ok': 'başarılı',
    'activity.status.error': 'hata',

    /* ── ExpandedDetail ── */
    'activity.detail.section.tokens': 'Token kırılımı',
    'activity.detail.base': 'Bağlam girişi (taze)',
    'activity.detail.cacheRead': 'Cache okuma (önbellek)',
    'activity.detail.cacheWrite': 'Cache yazma',
    'activity.detail.totalInput': 'Toplam giriş',
    'activity.detail.output': 'Çıkış',
    'activity.detail.totalTokens': 'Toplam token',
    'activity.detail.section.cost': 'Maliyet ve istek',
    'activity.detail.costTL': 'Maliyet (₺)',
    'activity.detail.costUSD': 'Maliyet ($)',
    'activity.detail.remaining': 'Kalan bakiye (₺)',
    'activity.detail.latency': 'Gecikme',
    'activity.detail.apiKey': 'API anahtarı',
    'activity.detail.type': 'İşlem tipi',
    'activity.detail.errorCode': 'Hata kodu',
    'activity.detail.requestId': 'İstek ID',

    /* ── UsageHistoryTable ── */
    'activity.table.title': 'Detaylı kullanım geçmişi',
    'activity.table.subtitle': 'Her istek: tarih, model, bağlam/cache token kırılımı ve ₺ + $ maliyet. Satıra tıkla, tüm detayı gör.',
    'activity.table.recordCount': '{count} kayıt',
    'activity.table.filter.allModels': 'Tüm modeller',
    'activity.table.filter.allStatuses': 'Tüm durumlar',
    'activity.table.filter.onlyOk': 'Yalnız başarılı',
    'activity.table.filter.onlyError': 'Yalnız hata',
    'activity.table.filter.searchPlaceholder': 'Model, istek ID, anahtar ara…',
    'activity.table.filter.clear': 'Temizle',
    'activity.table.empty': 'Henüz kullanım kaydı yok. İlk API çağrısından sonra burada görünür.',
    'activity.table.noMatch': 'Bu filtreyle eşleşen kayıt yok.',
    'activity.table.col.datetime': 'Tarih · saat',
    'activity.table.col.model': 'Model',
    'activity.table.col.apiKey': 'API anahtarı',
    'activity.table.col.tokens': 'Token (g+ç)',
    'activity.table.col.latency': 'Gecikme',
    'activity.table.col.cost': 'Maliyet ₺ / $',
    'activity.table.col.status': 'Durum',
    'activity.table.loadMore': 'Daha fazla göster ({remaining} kalan)',

    /* ── Error state ── */
    'activity.error.loadFailed': 'Aktivite verisi alınamadı.',

    /* ── ActivityTab header ── */
    'activity.header.caption': 'Aktivite',
    'activity.header.title': 'API çağrıları,',
    'activity.header.titleAccent': 'gerçek',
    'activity.header.subtitle': 'Yeni hesaplarda bu ekran sıfırdan başlar. Kullanım oldukça doğal olarak dolar.',

    /* ── Range buttons ── */
    'activity.range.hour': 'Saat',
    'activity.range.day': 'Gün',
    'activity.range.week': 'Hafta',
    'activity.range.month': 'Ay',

    /* ── Range labels (used in subtitles & deltas) ── */
    'activity.rangeLabel.hour': 'son 1 saat',
    'activity.rangeLabel.day': 'son 24 saat',
    'activity.rangeLabel.week': 'son 7 gün',
    'activity.rangeLabel.month': 'son 30 gün',

    /* ── KPI cards ── */
    'activity.kpi.requests.label': 'Toplam istek',
    'activity.kpi.requests.delta': '{rangeLabel} · cap yok',
    'activity.kpi.requests.loading': 'yükleniyor…',
    'activity.kpi.tokens.label': 'Toplam token',
    'activity.kpi.tokens.deltaCache': 'cache {cache} · {rangeLabel}',
    'activity.kpi.tokens.deltaNoCache': 'g {input} · ç {output}',
    'activity.kpi.latency.label': 'Avg gecikme',
    'activity.kpi.latency.measured': '{total} kayıt ölçüldü',
    'activity.kpi.latency.none': 'ölçüm yok',
    'activity.kpi.spend.label': 'Bu ay harcama',

    /* ── Latency chart ── */
    'activity.chart.latency.title': 'Gecikme eğrisi',
    'activity.chart.latency.subtitle': 'İstek başına milisaniye · {rangeLabel}',
    'activity.chart.latency.legend': 'Gecikme',
    'activity.chart.latency.empty': 'Henüz çağrı yapılmadı. İlk istekten sonra gecikme eğrisi burada oluşur.',

    /* ── Provider donut card ── */
    'activity.card.provider.title': 'Sağlayıcı dağılımı',
    'activity.card.provider.subtitle': 'Gerçek kullanım kayıtları',
    'activity.card.provider.empty': 'Henüz kullanım olmadığı için dağılım görünmüyor.',

    /* ── Cost timeseries chart ── */
    'activity.chart.cost.title': 'Maliyet zaman serisi',
    'activity.chart.cost.subtitle': '₺ ve $ tüketim akışı · {rangeLabel}',
    'activity.chart.cost.lineTL': 'Maliyet ₺',
    'activity.chart.cost.lineUSD': 'Maliyet $',
    'activity.chart.cost.empty': 'Maliyet akışı yok.',

    /* ── Token timeseries chart ── */
    'activity.chart.tokens.title': 'Token tüketimi',
    'activity.chart.tokens.subtitle': 'Giriş · çıkış · önbellek (cache) · {rangeLabel}',
    'activity.chart.tokens.input': 'Giriş',
    'activity.chart.tokens.output': 'Çıkış',
    'activity.chart.tokens.cache': 'Cache',
    'activity.chart.tokens.empty': 'Token akışı yok.',

    /* ── Success/error bar chart ── */
    'activity.chart.successError.title': 'Başarı / hata dağılımı',
    'activity.chart.successError.subtitle': 'Her kovadaki sonuç oranı · {rangeLabel}',
    'activity.chart.successError.success': 'Başarılı',
    'activity.chart.successError.error': 'Hata',
    'activity.chart.successError.empty': 'Sonuç verisi yok.',

    /* ── Top models bar chart ── */
    'activity.chart.topModels.title': 'En çok kullandığın modeller',
    'activity.chart.topModels.sub': 'İstek sayısına göre ilk 8',
    'activity.chart.topModels.bar': 'İstek',
    'activity.chart.topModels.empty': 'Model verisi yok.',

    /* ── Heatgrid section ── */
    'activity.section.heatgrid.title': 'Saat / gün yoğunluğu',
    'activity.section.heatgrid.subtitle': 'Hangi zaman diliminde ne kadar istek attın · {rangeLabel}',
    'activity.section.heatgrid.empty': 'Yoğunluk verisi yok.',

    /* ── Model breakdown table ── */
    'activity.modelTable.title': 'Model bazında kullanım & maliyet',
    'activity.modelTable.subtitle': 'Kendi en çok kullandığın / en pahalı modellerin · {rangeLabel}',
    'activity.modelTable.col.model': 'Model',
    'activity.modelTable.col.requests': 'İstek',
    'activity.modelTable.col.share': 'Pay %',
    'activity.modelTable.col.tokens': 'Token',
    'activity.modelTable.col.costTL': 'Maliyet ₺',
    'activity.modelTable.col.costUSD': 'Maliyet $',
    'activity.modelTable.col.costShare': 'Mlyt %',
    'activity.modelTable.empty': 'Bu aralıkta model kullanımı yok.',
  },
  en: {
    /* ── HeatGrid ── */
    'activity.heatgrid.tooltip': '{label} · {requestCount} requests',
    'activity.heatgrid.tooltip.errors': '{label} · {requestCount} requests · {errorCount} errors',
    'activity.heatgrid.cell.errors': '{errorCount} errors',

    /* ── ProviderDonut ── */
    'activity.donut.requests': 'requests',

    /* ── StatusBadge ── */
    'activity.status.ok': 'success',
    'activity.status.error': 'error',

    /* ── ExpandedDetail ── */
    'activity.detail.section.tokens': 'Token breakdown',
    'activity.detail.base': 'Context input (fresh)',
    'activity.detail.cacheRead': 'Cache read',
    'activity.detail.cacheWrite': 'Cache write',
    'activity.detail.totalInput': 'Total input',
    'activity.detail.output': 'Output',
    'activity.detail.totalTokens': 'Total tokens',
    'activity.detail.section.cost': 'Cost & request',
    'activity.detail.costTL': 'Cost (₺)',
    'activity.detail.costUSD': 'Cost ($)',
    'activity.detail.remaining': 'Remaining balance (₺)',
    'activity.detail.latency': 'Latency',
    'activity.detail.apiKey': 'API key',
    'activity.detail.type': 'Request type',
    'activity.detail.errorCode': 'Error code',
    'activity.detail.requestId': 'Request ID',

    /* ── UsageHistoryTable ── */
    'activity.table.title': 'Detailed usage history',
    'activity.table.subtitle': 'Each request: date, model, context/cache token breakdown and ₺ + $ cost. Click a row to see full details.',
    'activity.table.recordCount': '{count} records',
    'activity.table.filter.allModels': 'All models',
    'activity.table.filter.allStatuses': 'All statuses',
    'activity.table.filter.onlyOk': 'Successful only',
    'activity.table.filter.onlyError': 'Errors only',
    'activity.table.filter.searchPlaceholder': 'Search model, request ID, key…',
    'activity.table.filter.clear': 'Clear',
    'activity.table.empty': 'No usage records yet. They will appear here after your first API call.',
    'activity.table.noMatch': 'No records match this filter.',
    'activity.table.col.datetime': 'Date · time',
    'activity.table.col.model': 'Model',
    'activity.table.col.apiKey': 'API key',
    'activity.table.col.tokens': 'Tokens (in+out)',
    'activity.table.col.latency': 'Latency',
    'activity.table.col.cost': 'Cost ₺ / $',
    'activity.table.col.status': 'Status',
    'activity.table.loadMore': 'Show more ({remaining} remaining)',

    /* ── Error state ── */
    'activity.error.loadFailed': 'Could not load activity data.',

    /* ── ActivityTab header ── */
    'activity.header.caption': 'Activity',
    'activity.header.title': 'API calls,',
    'activity.header.titleAccent': 'live',
    'activity.header.subtitle': 'New accounts start from zero. It fills naturally as you use the API.',

    /* ── Range buttons ── */
    'activity.range.hour': 'Hour',
    'activity.range.day': 'Day',
    'activity.range.week': 'Week',
    'activity.range.month': 'Month',

    /* ── Range labels ── */
    'activity.rangeLabel.hour': 'last 1 hour',
    'activity.rangeLabel.day': 'last 24 hours',
    'activity.rangeLabel.week': 'last 7 days',
    'activity.rangeLabel.month': 'last 30 days',

    /* ── KPI cards ── */
    'activity.kpi.requests.label': 'Total requests',
    'activity.kpi.requests.delta': '{rangeLabel} · no cap',
    'activity.kpi.requests.loading': 'loading…',
    'activity.kpi.tokens.label': 'Total tokens',
    'activity.kpi.tokens.deltaCache': 'cache {cache} · {rangeLabel}',
    'activity.kpi.tokens.deltaNoCache': 'in {input} · out {output}',
    'activity.kpi.latency.label': 'Avg latency',
    'activity.kpi.latency.measured': '{total} records measured',
    'activity.kpi.latency.none': 'no measurements',
    'activity.kpi.spend.label': 'This month spend',

    /* ── Latency chart ── */
    'activity.chart.latency.title': 'Latency curve',
    'activity.chart.latency.subtitle': 'Milliseconds per request · {rangeLabel}',
    'activity.chart.latency.legend': 'Latency',
    'activity.chart.latency.empty': 'No calls yet. The latency curve will appear here after your first request.',

    /* ── Provider donut card ── */
    'activity.card.provider.title': 'Provider distribution',
    'activity.card.provider.subtitle': 'Actual usage records',
    'activity.card.provider.empty': 'No usage yet — distribution will appear once you start making requests.',

    /* ── Cost timeseries chart ── */
    'activity.chart.cost.title': 'Cost time series',
    'activity.chart.cost.subtitle': '₺ and $ consumption flow · {rangeLabel}',
    'activity.chart.cost.lineTL': 'Cost ₺',
    'activity.chart.cost.lineUSD': 'Cost $',
    'activity.chart.cost.empty': 'No cost data.',

    /* ── Token timeseries chart ── */
    'activity.chart.tokens.title': 'Token consumption',
    'activity.chart.tokens.subtitle': 'Input · output · cache · {rangeLabel}',
    'activity.chart.tokens.input': 'Input',
    'activity.chart.tokens.output': 'Output',
    'activity.chart.tokens.cache': 'Cache',
    'activity.chart.tokens.empty': 'No token data.',

    /* ── Success/error bar chart ── */
    'activity.chart.successError.title': 'Success / error distribution',
    'activity.chart.successError.subtitle': 'Result ratio per bucket · {rangeLabel}',
    'activity.chart.successError.success': 'Successful',
    'activity.chart.successError.error': 'Error',
    'activity.chart.successError.empty': 'No result data.',

    /* ── Top models bar chart ── */
    'activity.chart.topModels.title': 'Your most used models',
    'activity.chart.topModels.sub': 'Top 8 by request count',
    'activity.chart.topModels.bar': 'Requests',
    'activity.chart.topModels.empty': 'No model data.',

    /* ── Heatgrid section ── */
    'activity.section.heatgrid.title': 'Hour / day intensity',
    'activity.section.heatgrid.subtitle': 'How many requests you sent per time slot · {rangeLabel}',
    'activity.section.heatgrid.empty': 'No intensity data.',

    /* ── Model breakdown table ── */
    'activity.modelTable.title': 'Usage & cost by model',
    'activity.modelTable.subtitle': 'Your most used / most expensive models · {rangeLabel}',
    'activity.modelTable.col.model': 'Model',
    'activity.modelTable.col.requests': 'Requests',
    'activity.modelTable.col.share': 'Share %',
    'activity.modelTable.col.tokens': 'Tokens',
    'activity.modelTable.col.costTL': 'Cost ₺',
    'activity.modelTable.col.costUSD': 'Cost $',
    'activity.modelTable.col.costShare': 'Cost %',
    'activity.modelTable.empty': 'No model usage in this range.',
  },
};

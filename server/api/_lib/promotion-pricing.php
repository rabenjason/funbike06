<?php
// Les promotions historiques sans mode continuent à être calculées au pourcentage.
function funbikePromotionPrice($offer) {
    if (!is_array($offer)) return null;
    $mode = $offer['pricingMode'] ?? 'percent';
    $price = $offer['originalPrice'] ?? null;
    $discount = $offer['discountPercent'] ?? null;
    if (!in_array($mode, ['percent', 'price', 'price_percent'], true) || !is_int($price) || $price <= 0 || $price > 1000000000000) return null;
    if ($mode === 'price') {
        if ((!is_int($discount) && !is_float($discount)) || (float)$discount !== 0.0) return null;
    } elseif ((!is_int($discount) && !is_float($discount)) || !is_finite((float)$discount) || $discount <= 0 || $discount > 100 || abs($discount * 100 - round($discount * 100)) > 0.00000001) return null;
    if ($mode === 'percent') return $price - intdiv($price * (int) round($discount * 100) + 5000, 10000);
    $final = $offer['promotionalPrice'] ?? null;
    if (!is_int($final) || $final < 0 || $final >= $price) return null;
    return $final;
}

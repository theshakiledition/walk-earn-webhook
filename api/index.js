const express = require('express');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

const db = admin.firestore();
const app = express();

app.get('/api', async (req, res) => {
  try {
    const { user_id, transaction_id, custom_data } = req.query;
    if (!user_id || !transaction_id) {
      return res.status(400).send("Missing SSV parameters");
    }

    let payload = { adRevenueUsd: 0.020, mode: "INSTANT_BATCH" };
    if (custom_data) {
      try { payload = JSON.parse(custom_data); } catch (_) {}
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const txRef = db.collection("coin_transactions").doc(transaction_id);
    const userRef = db.collection("users").doc(user_id);

    await db.runTransaction(async (t) => {
      const txDoc = await t.get(txRef);
      if (txDoc.exists) return;

      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;
      const user = userDoc.data();

      const isNewDay = user.last_active_date !== todayStr;
      const adsWatchedToday = isNewDay ? 0 : (user.ads_watched_today || 0);
      const stepBank = user.step_bank_balance || 0;

      if (adsWatchedToday >= 10 || stepBank <= 0) {
        t.set(txRef, {
          user_id,
          coins_minted: 0,
          gross_ad_revenue_usd: payload.adRevenueUsd,
          house_profit_usd: payload.adRevenueUsd,
          reason: "DAILY_CAP_OR_EMPTY_BANK",
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      const verifiedAdRev = Math.max(0.001, Math.min(Number(payload.adRevenueUsd) || 0.020, 0.040));
      const userShareUsd = verifiedAdRev * (1.0 - 0.70); // 70% House Cut
      const maxAllowedCoins = Math.max(5, Math.floor(userShareUsd * 10000));

      const stepsConverted = Math.min(stepBank, maxAllowedCoins);
      const coinsMinted = stepsConverted;
      const actualUserLiabilityUsd = coinsMinted / 10000;
      const houseNetProfitUsd = verifiedAdRev - actualUserLiabilityUsd;

      t.update(userRef, {
        last_active_date: todayStr,
        ads_watched_today: adsWatchedToday + 1,
        step_bank_balance: stepBank - stepsConverted,
        steps_converted_today: (isNewDay ? 0 : (user.steps_converted_today || 0)) + stepsConverted,
        coin_balance: (user.coin_balance || 0) + coinsMinted,
        usd_equivalent: Number((((user.coin_balance || 0) + coinsMinted) / 10000).toFixed(4)),
        lifetime_revenue_generated_usd: admin.firestore.FieldValue.increment(verifiedAdRev),
        lifetime_house_profit_usd: admin.firestore.FieldValue.increment(houseNetProfitUsd),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      t.set(txRef, {
        user_id,
        steps_converted: stepsConverted,
        coins_minted: coinsMinted,
        gross_ad_revenue_usd: Number(verifiedAdRev.toFixed(5)),
        user_liability_usd: Number(actualUserLiabilityUsd.toFixed(5)),
        house_profit_usd: Number(houseNetProfitUsd.toFixed(5)),
        house_margin_percent: Math.round((houseNetProfitUsd / verifiedAdRev) * 100),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).send("OK from Vercel Serverless");
  } catch (e) {
    console.error("Vercel SSV Error:", e);
    return res.status(500).send("Error");
  }
});

module.exports = app;

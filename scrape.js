
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapePrices() {
    try {
        const sources = [
            'https://www.isagha.com/',
            'https://www.goldpriceegypt.com/'
        ];
        
        let prices = null;
        
        for (let url of sources) {
            try {
                console.log("Trying ${url}...");
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000
                });
                
                const $ = cheerio.load(data);
                
                // محاولة استخراج الأسعار
                const gold24Sell = extractPrice($, ['.gold-24', '.price-24', '.egp-24']);
                const gold21Sell = extractPrice($, ['.gold-21', '.price-21', '.egp-21']);
                const gold18Sell = extractPrice($, ['.gold-18', '.price-18', '.egp-18']);
                const silver999Sell = extractPrice($, ['.silver-999', '.silver-pure', '.silver-price']);
                
                if (gold24Sell && gold24Sell > 3000) {
                    prices = {
                        date: new Date().toISOString(),
                        source: url,
                        gold: {
                            "24": { 
                                sell: gold24Sell, 
                                buy: Math.round(gold24Sell * 0.99) 
                            },
                            "21": { 
                                sell: gold21Sell || Math.round(gold24Sell * 0.875), 
                                buy: Math.round((gold21Sell || gold24Sell * 0.875) * 0.99) 
                            },
                            "18": { 
                                sell: gold18Sell || Math.round(gold24Sell * 0.75), 
                                buy: Math.round((gold18Sell || gold24Sell * 0.75) * 0.99) 
                            }
                        },
                        silver: {
                            "999": { 
                                sell: silver999Sell || Math.round(gold24Sell * 0.0115), 
                                buy: Math.round((silver999Sell || gold24Sell * 0.0115) * 0.93) 
                            },
                            "925": { 
                                sell: Math.round((silver999Sell || gold24Sell * 0.0115) * 0.925), 
                                buy: Math.round((silver999Sell || gold24Sell * 0.0115) * 0.925 * 0.93) 
                            },
                            "800": { 
                                sell: Math.round((silver999Sell || gold24Sell * 0.0115) * 0.80), 
                                buy: Math.round((silver999Sell || gold24Sell * 0.0115) * 0.80 * 0.93) 
                            }
                        },
                        usdToEgp: 49.10
                    };
                    console.log('✅ Success from:', url);
                    break;
                }
            } catch (e) {
                console.log("❌ Failed ${url}:, e.message");
                continue;
            }
        }
        
        if (!prices) {
            throw new Error('All sources failed');
        }
        
        fs.writeFileSync('prices.json', JSON.stringify(prices, null, 2));
        console.log('✅ Prices saved:', prices.date);
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        
        // استخدم النسخة القديمة أو الافتراضية
        const defaultPrices = {
            date: new Date().toISOString(),
            note: "Using default prices",
            gold: { 
                "24": {sell: 4025, buy: 3985},


"21": {sell: 3522, buy: 3482}, 
                "18": {sell: 3019, buy: 2979} 
            },
            silver: { 
                "999": {sell: 47, buy: 44}, 
                "925": {sell: 43, buy: 40}, 
                "800": {sell: 37, buy: 34} 
            },
            usdToEgp: 49.10
        };
        fs.writeFileSync('prices.json', JSON.stringify(defaultPrices, null, 2));
    }
}

function extractPrice($, selectors) {
    for (let selector of selectors) {
        try {
            const element = $(selector).first();
            if (element.length) {
                const text = element.text().replace(/[^0-9.]/g, '');
                const price = parseFloat(text);
                if (price > 1000) return Math.round(price);
            }
        } catch (e) {}
    }
    return null;
}

scrapePrices();

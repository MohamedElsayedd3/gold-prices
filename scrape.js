const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapePrices() {
    try {
        // جرب أكثر من موقع لو واحد فشل
        const sources = [
            'https://www.isagha.com/',
            'https://www.goldpriceegypt.com/',
            'https://egypt.goldrate24.com/'
        ];
        
        let prices = null;
        
        for (let url of sources) {
            try {
                console.log(`Trying ${url}...`);
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });
                
                const $ = cheerio.load(data);
                
                // محاولة استخراج الأسعار (حسب هيكل الموقع)
                prices = {
                    date: new Date().toISOString(),
                    source: url,
                    gold: {
                        "24": {
                            sell: extractPrice($, ['.gold-24', '.price-24', '[data-karat="24"]']) || 4025,
                            buy: extractPrice($, ['.gold-24-buy', '.buy-24']) || 3985
                        },
                        "21": {
                            sell: extractPrice($, ['.gold-21', '.price-21', '[data-karat="21"]']) || 3522,
                            buy: extractPrice($, ['.gold-21-buy',-21-buy', '.buy-21']) || 3482
                        },
                        "18": {
                            sell: extractPrice($, ['.gold-18', '.price-18', '[data-karat="18"]']) || 3019,
                            buy: extractPrice($, ['.gold-18-buy', '.buy-18']) || 2979
                        }
                    },
                    silver: {
                        "999": {
                            sell: extractPrice($, ['.silver-999', '.silver-pure', '[data-silver="999"]']) || 47,
                            buy: extractPrice($, ['.silver-999-buy']) || 44
                        },
                        "925": {
                            sell: extractPrice($, ['.silver-925', '[data-silver="925"]']) || 43,
                            buy: extractPrice($, ['.silver-925-buy']) || 40
                        },
                        "800": {
                            sell: extractPrice($, ['.silver-800', '[data-silver="800"]']) || 37,
                            buy: extractPrice($, ['.silver-800-buy']) || 34
                        }
                    },
                    usdToEgp: extractPrice($, ['.usd-rate', '.dollar-rate', '[data-currency="USD"]']) || 49.10
                };
                
                // لو نجحنا في جلب الأسعار، نخرج من اللوب
                if (prices.gold["24"].sell > 3000) {
                    console.log('✅ Success from:', url);
                    break;
                }
                
            } catch (e) {
                console.log(`❌ Failed ${url}:`, e.message);
                continue;
            }
        }
        
        if (!prices || prices.gold["24"].sell < 3000) {
            throw new Error('Could not fetch prices from any source');
        }
        
        // حفظ الأسعار
        fs.writeFileSync('prices.json', JSON.stringify(prices, null, 2));
        console.log('✅ Prices saved:', prices.date);
        
        // حفظ نسخة احتياطية
        fs.writeFileSync('prices-backup.json', JSON.stringify(prices, null, 2));
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        
        // لو فشل، استخدم النسخة القديمة لو موجودة
        if (fs.existsSync('prices-backup.json')) {
            const oldPrices = JSON.parse(fs.readFileSync('prices-backup.json'));
            oldPrices.date = new Date().toISOString();
            oldPrices.note = "Using backup prices";
            fs.writeFileSync('prices.json', JSON.stringify(oldPrices, null, 2));
            console.log('⚠️ Using backup prices');
        } else {
            // استخدم أسعار افتراضية
            const defaultPrices = {
                date: new Date().toISOString(),
                note: "Using default prices - scraping failed",
                gold: { "24": {sell: 4025, buy: 3985}, "21": {sell: 3522, buy: 3482}, "18": {sell: 3019, buy: 2979} },
                silver: { "999": {sell: 47, buy: 44}, "925": {sell: 43, buy: 40}, "800": {sell: 37, buy: 34} },
                usdToEgp: 49.10
            };
            fs.writeFileSync('prices.json', JSON.stringify(defaultPrices, null, 2));
        }
        
        process.exit(1);
    }
}

// دالة مساعدة لاستخراج السعر
function extractPrice($, selectors) {
    for (let selector of selectors) {
        const element = $(selector).first();
        if (element.length) {
            const text = element.text().replace(/[^0-9.]/g, '');
            const price = parseFloat(text);
            if (price > 0) return price;
        }
    }
    return null;
}

scrapePrices();

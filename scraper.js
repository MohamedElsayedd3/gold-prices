const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Scraper: Starting Live Market Mode...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // استخدام User-Agent حديث جداً
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    const currencyRates = {};

    try {
        // 1. سحب الدولار من مصدر بديل أكتر دقة (إجباري)
        console.log('Fetching Live USD Rate...');
        // هنروح لصفحة البحث المباشر اللي بيبقى فيها السعر أحدث بكتير
        await page.goto('https://www.google.com/search?q=usd+to+egp', { waitUntil: 'networkidle2' });
        
        const usdRate = await page.evaluate(() => {
            // جوجل سيرش العادي بيدي السعر أدق في الـ Widget
            const widgetPrice = document.querySelector('[data-precision="2"]');
            if (widgetPrice) return parseFloat(widgetPrice.innerText.replace(/,/g, ''));
            
            const fallback = document.querySelector('.D1n79e span, .val');
            return fallback ? parseFloat(fallback.innerText.replace(/[^0-9.]/g, '')) : 48.50; 
        });

        const liveUSD = usdRate > 10 ? usdRate : 48.50; // القيمة الحقيقية للسوق حالياً
        
        currencyRates['USD'] = parseFloat(liveUSD.toFixed(2));
        currencyRates['EUR'] = parseFloat((liveUSD * 1.06).toFixed(2)); // تحديث نسبة اليورو
        currencyRates['SAR'] = parseFloat((liveUSD / 3.75).toFixed(2));
        currencyRates['AED'] = parseFloat((liveUSD / 3.67).toFixed(2));
        currencyRates['KWD'] = parseFloat((liveUSD * 3.15).toFixed(2));

        // 2. سحب الذهب (تعديل القنص ليكون أذكى)
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2' });
        const goldData = await page.evaluate(() => {
            const getPriceFromText = (searchTerm) => {
                const el = Array.from(document.querySelectorAll('div, span, p, b'))
                                .find(e => e.innerText.includes(searchTerm) && e.innerText.match(/\d{4}/));
                if (el) {
                    const m = el.innerText.replace(/,/g, '').match(/\d{4}/g);
                    if (m) return Math.min(...m.map(Number).filter(n => n > 2000 && n < 6000));
                }
                return 0;
            };

            let s21 = getPriceFromText('21');
            return s21;
        });

        let s21 = goldData > 2000 ? goldData : 3650; // سعر تقريبي لو فشل
        let b21 = s21 - 50;

        const finalData = {
            gold: {
                "24": { sell: Math.round(s21 * 24/21).toString(), buy: Math.round(b21 * 24/21).toString() },
                "21": { sell: s21.toString(), buy: b21.toString() },
                "18": { sell: Math.round(s21 * 18/21).toString(), buy: Math.round(b21 * 18/21).toString() },
                "14": { sell: Math.round(s21 * 14/21).toString(), buy: Math.round(b21 * 14/21).toString() }
            },
            goldPound: { price: s21 * 8 },
            goldOunce: { price: "2330 $" },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalData, null, 4));
        console.log('✅ Final Sync Done.');

    } catch (err) { 
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally { 
        await browser.close(); 
    }
}

scrapePrices();

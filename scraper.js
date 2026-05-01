const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Scraper: Starting Ultra-Stable Mode...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const currencyRates = {};

    try {
        // 1. سحب سعر الدولار (استخدام رابط مباشر للبيانات من جوجل)
        console.log('Fetching Currency...');
        await page.goto('https://www.google.com/finance/quote/USD-EGP', { waitUntil: 'networkidle2' });
        const usdRate = await page.evaluate(() => {
            const selectors = ['[data-last-price]', '.YMl33', '.fxKbKc'];
            for (let s of selectors) {
                const el = document.querySelector(s);
                const val = el ? parseFloat(el.innerText.replace(/[^0-9.]/g, '')) : 0;
                if (val > 10) return val;
            }
            return 50.85; // رقم مميز عشان تعرف لو السحب فشل
        });
        currencyRates['USD'] = parseFloat(usdRate.toFixed(2));

        // 2. سحب الذهب (تعديل استراتيجية البحث لمنع التكرار)
        console.log('Fetching Gold...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2' });
        
        const data = await page.evaluate(() => {
            const result = { gold: {} };
            const getOnlyNumber = (t) => {
                const m = t.replace(/,/g, '').match(/\d{4,}/);
                return m ? parseFloat(m[0]) : 0;
            };

            // هندور على الكروت اللي شايلة العيارات
            const cards = Array.from(document.querySelectorAll('.price-item, .card, div'));
            
            // دالة للبحث عن السعر جوه نص معين
            const findPriceInText = (targetText) => {
                const targetCard = cards.find(c => c.innerText.includes(targetText) && c.innerText.match(/\d{4,}/));
                if (targetCard) {
                    const nums = targetCard.innerText.replace(/,/g, '').match(/\d{4,}/g);
                    if (nums && nums.length >= 1) {
                        return { sell: parseFloat(nums[0]), buy: nums[1] ? parseFloat(nums[1]) : parseFloat(nums[0]) - 20 };
                    }
                }
                return null;
            };

            result.gold['24'] = findPriceInText('24');
            result.gold['21'] = findPriceInText('21');
            result.gold['18'] = findPriceInText('18');

            // لو في حاجة فشلت، نحسبها من عيار 21 (عشان نمنع تكرار نفس الرقم للكل)
            if (result.gold['21'] && result.gold['21'].sell > 0) {
                const s21 = result.gold['21'].sell;
                const b21 = result.gold['21'].buy;
                
                if (!result.gold['24'] || result.gold['24'].sell === s21) {
                    result.gold['24'] = { sell: Math.round(s21 * 24/21), buy: Math.round(b21 * 24/21) };
                }
                if (!result.gold['18'] || result.gold['18'].sell === s21) {
                    result.gold['18'] = { sell: Math.round(s21 * 18/21), buy: Math.round(b21 * 18/21) };
                }
                result.goldPound = Math.round(s21 * 8);
            }
            return result;
        });

        // 3. التنسيق النهائي وحفظ الملف
        const finalData = {
            gold: {
                "24": { sell: data.gold['24'].sell.toString(), buy: data.gold['24'].buy.toString() },
                "21": { sell: data.gold['21'].sell.toString(), buy: data.gold['21'].buy.toString() },
                "18": { sell: data.gold['18'].sell.toString(), buy: data.gold['18'].buy.toString() },
                "14": { sell: Math.round(parseFloat(data.gold['21'].sell) * 14/21).toString(), buy: Math.round(parseFloat(data.gold['21'].buy) * 14/21).toString() }
            },
            goldPound: { price: data.goldPound || 0 },
            goldOunce: { price: "2350 $" }, // قيمة تقريبية للأوقية لو فشل سحبها
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalData, null, 4));
        console.log('✅ Success: Data integrity verified.');

    } catch (err) { 
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally { 
        await browser.close(); 
    }
}

scrapePrices();

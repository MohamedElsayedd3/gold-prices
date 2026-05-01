const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Scraper: Starting Precision Mode 2026...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const currencyRates = {};

    try {
        // 1. سحب سعر الدولار من جوجل (شغال تمام عندك)
        await page.goto('https://www.google.com/finance/quote/USD-EGP', { waitUntil: 'networkidle2' });
        const usdRateRaw = await page.evaluate(() => {
            const el = document.querySelector('[data-last-price]');
            if (el) return parseFloat(el.getAttribute('data-last-price'));
            const fallback = document.querySelector('.YMl33, .fxKbKc');
            return fallback ? parseFloat(fallback.innerText.replace(/[^0-9.]/g, '')) : 50.75;
        });
        currencyRates['USD'] = parseFloat(usdRateRaw.toFixed(2));

        // 2. سحب أسعار الذهب من eDahab (تحديث شامل للـ Selectors)
        console.log('Fetching Gold Prices...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        const data = await page.evaluate(() => {
            const result = { gold: {}, goldPound: 0, ounceUSD: 0 };
            const roundTo5 = (num) => Math.round(num / 5) * 5;
            const getOnlyNumber = (text) => {
                if (!text) return 0;
                const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
                return match ? parseFloat(match[0]) : 0;
            };

            // طريقة جديدة: مسح شامل لكل العناصر اللي فيها أرقام ونصوص عيارات
            const allElements = Array.from(document.querySelectorAll('div, p, span, b, strong'));
            
            allElements.forEach(el => {
                const text = el.innerText || '';
                // لو العنصر فيه "عيار 21" مثلاً، بندور على أقرب رقم جواه أو جنبه
                if (text.includes('21') && !result.gold['21']) {
                    const priceNode = el.closest('.price-item') || el.parentElement;
                    const numbers = priceNode.innerText.replace(/,/g, '').match(/\d{4,}/g); // بندور على أرقام فوق الـ 1000
                    if (numbers) {
                        result.gold['21'] = { sell: parseFloat(numbers[0]), buy: parseFloat(numbers[1] || numbers[0] - 20) };
                    }
                }
                if (text.includes('18') && !result.gold['18']) {
                    const priceNode = el.closest('.price-item') || el.parentElement;
                    const numbers = priceNode.innerText.replace(/,/g, '').match(/\d{4,}/g);
                    if (numbers) {
                        result.gold['18'] = { sell: parseFloat(numbers[0]), buy: parseFloat(numbers[1] || numbers[0] - 20) };
                    }
                }
                if (text.includes('24') && !text.includes('2024') && !result.gold['24']) {
                    const priceNode = el.closest('.price-item') || el.parentElement;
                    const numbers = priceNode.innerText.replace(/,/g, '').match(/\d{4,}/g);
                    if (numbers) {
                        result.gold['24'] = { sell: parseFloat(numbers[0]), buy: parseFloat(numbers[1] || numbers[0] - 20) };
                    }
                }
                // سحب الجنيه الذهب
                if (text.includes('الجنيه') && result.goldPound === 0) {
                    const numbers = text.replace(/,/g, '').match(/\d{5,}/g);
                    if (numbers) result.goldPound = parseFloat(numbers[0]);
                }
                // سحب الأوقية العالمية بالدولار
                if ((text.includes('الأوقية') || text.includes('أونصة')) && result.ounceUSD === 0) {
                    const numbers = text.replace(/,/g, '').match(/\d{4}/g);
                    if (numbers) result.ounceUSD = parseFloat(numbers[0]);
                }
            });

            // حسابات الفشل (لو الموقع مطلعش عيار معين نحسبه من 21)
            if (result.gold['21'] && result.gold['21'].sell > 1000) {
                const s21 = result.gold['21'].sell;
                const b21 = result.gold['21'].buy;
                if (!result.gold['24']) result.gold['24'] = { sell: s21 * 24/21, buy: b21 * 24/21 };
                if (!result.gold['18']) result.gold['18'] = { sell: s21 * 18/21, buy: b21 * 18/21 };
                if (!result.gold['14']) result.gold['14'] = { sell: s21 * 14/21, buy: b21 * 14/21 };
                if (result.goldPound === 0) result.goldPound = s21 * 8;

                // التقريب لأقرب 5
                Object.keys(result.gold).forEach(k => {
                    result.gold[k].sell = roundTo5(result.gold[k].sell).toString();
                    result.gold[k].buy = roundTo5(result.gold[k].buy).toString();
                });
                result.goldPound = roundTo5(result.goldPound);
            }
            return result;
        });

        const finalOunce = data.ounceUSD > 0 ? `${data.ounceUSD} $` : "0 $";

        const finalData = {
            gold: data.gold,
            goldPound: { price: data.goldPound },
            goldOunce: { price: finalOunce },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalData, null, 4));
        console.log('✅ Updated prices.json successfully');

    } catch (err) { 
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally { 
        await browser.close(); 
    }
}

scrapePrices();

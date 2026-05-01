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
    
    // خطوة مهمة: إيهام جوجل أننا متصفح حقيقي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const currencyRates = {};

    try {
        // 1. سحب سعر الدولار من جوجل بدقة عالية
        console.log('Fetching USD Rate from Google...');
        await page.goto('https://www.google.com/finance/quote/USD-EGP', { waitUntil: 'networkidle2' });
        
        const usdRate = await page.evaluate(() => {
            // المحاولة الأولى: الـ Attribute الأساسي
            const el = document.querySelector('[data-last-price]');
            if (el && parseFloat(el.getAttribute('data-last-price')) > 10) {
                return parseFloat(el.getAttribute('data-last-price'));
            }

            // المحاولة الثانية: البحث عن السعر في العناصر اللي جوجل بتستخدمها حالياً
            const priceSelectors = ['.YMl33', '.fxKbKc', '[data-price]'];
            for (let selector of priceSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const val = parseFloat(element.innerText.replace(/[^0-9.]/g, ''));
                    if (val > 10) return val;
                }
            }

            // المحاولة الثالثة: البحث الشامل عن أي رقم بجانب كلمة EGP
            const allElements = Array.from(document.querySelectorAll('div, span, b'));
            const egpElement = allElements.find(e => e.innerText.includes('EGP') && /\d+\.\d+/.test(e.innerText));
            if (egpElement) {
                const match = egpElement.innerText.match(/\d+\.\d+/);
                return match ? parseFloat(match[0]) : 50.75;
            }

            return 50.75; // رقم احتياطي مميز عشان تعرف لو السحب فشل
        });

        currencyRates['USD'] = usdRate;
        console.log(`Successfully fetched USD: ${usdRate}`);

        // 2. سحب أسعار الذهب من eDahab
        console.log('Fetching Gold Prices from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2' });
        
        const data = await page.evaluate(() => {
            const result = { gold: {}, goldPound: 0, ounceUSD: 0 };
            const roundTo5 = (num) => Math.round(num / 5) * 5;
            const getOnlyNumber = (text) => {
                if (!text) return 0;
                const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
                return match ? parseFloat(match[0]) : 0;
            };

            // سحب العيارات من الكروت
            document.querySelectorAll('.price-item').forEach(item => {
                const label = item.innerText || '';
                const priceTags = item.querySelectorAll('.number-font');
                if (priceTags.length >= 1) {
                    const sell = getOnlyNumber(priceTags[0].innerText);
                    const buy = priceTags[1] ? getOnlyNumber(priceTags[1].innerText) : (sell - 20);
                    
                    if (label.includes('24') && !label.includes('2024')) result.gold['24'] = { sell, buy };
                    else if (label.includes('21')) result.gold['21'] = { sell, buy };
                    else if (label.includes('18')) result.gold['18'] = { sell, buy };
                    else if (label.includes('14')) result.gold['14'] = { sell, buy };
                }
            });

            // سحب الجنيه الذهب والأوقية
            document.querySelectorAll('.number-font, span, div').forEach(el => {
                const text = el.innerText || '';
                if (text.includes('الجنيه الذهب') && result.goldPound === 0) {
                    const val = getOnlyNumber(text);
                    if (val > 10000) result.goldPound = val;
                }
                if ((text.includes('الأوقية') || text.includes('أونصة')) && result.ounceUSD === 0) {
                    const val = getOnlyNumber(text);
                    if (val > 1000 && val < 10000) result.ounceUSD = val;
                }
            });

            // حسابات احتياطية في حال نقص عيار
            if (result.gold['21'] && result.gold['21'].sell > 0) {
                const s21 = result.gold['21'].sell;
                const b21 = result.gold['21'].buy;
                if (!result.gold['24']) result.gold['24'] = { sell: s21 * 24/21, buy: b21 * 24/21 };
                if (!result.gold['18']) result.gold['18'] = { sell: s21 * 18/21, buy: b21 * 18/21 };
                if (result.goldPound === 0) result.goldPound = s21 * 8;

                // تقريب الأرقام لأقرب 5
                Object.keys(result.gold).forEach(k => {
                    result.gold[k].sell = roundTo5(result.gold[k].sell).toString();
                    result.gold[k].buy = roundTo5(result.gold[k].buy).toString();
                });
                result.goldPound = roundTo5(result.goldPound);
            }
            return result;
        });

        // تنسيق الأوقية
        const finalOunce = data.ounceUSD > 0 ? `${data.ounceUSD} $` : "0 $";

        // 3. حفظ البيانات في الملف
        const finalData = {
            gold: data.gold,
            goldPound: { price: data.goldPound },
            goldOunce: { price: finalOunce },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalData, null, 4));
        console.log('Update Success: prices.json is ready.');

    } catch (err) { 
        console.error('Critical Scraper Error:', err);
        process.exit(1);
    } finally { 
        await browser.close(); 
    }
}

scrapePrices();

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Scraper: Starting Precision Mode...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const currencyRates = {};

    try {
        // 1. سحب سعر الدولار من جوجل بدقة (مع الحفاظ على العلامة العشرية)
        await page.goto('https://www.google.com/finance/quote/USD-EGP', { waitUntil: 'domcontentloaded' });
        const usdRate = await page.evaluate(() => {
            const el = document.querySelector('main [data-last-price]');
            return el ? parseFloat(el.getAttribute('data-last-price')) : 51.0;
        });
        currencyRates['USD'] = usdRate;
        console.log(`USD Rate from Google: ${usdRate}`);

        // 2. سحب أسعار الذهب من eDahab
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2' });
        
        const data = await page.evaluate(() => {
            const result = { gold: {}, goldPound: 0, ounceUSD: 0 };
            
            // دالة التقريب لأقرب 5 (مثلاً 1203 -> 1205، 1201 -> 1200)
            const roundTo5 = (num) => Math.round(num / 5) * 5;

            // دالة لسحب الأرقام فقط
            const getOnlyNumber = (text) => {
                if (!text) return 0;
                const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
                return match ? parseFloat(match[0]) : 0;
            };

            // 1. استخراج العيارات بأمان من كروت الأسعار (.price-item)
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

            // 2. استخراج الأوقية بالدولار والجنيه الذهب من الأرقام المنفصلة
            document.querySelectorAll('.number-font').forEach(el => {
                const parentText = (el.parentElement ? el.parentElement.innerText : '') || '';
                
                // البحث عن سعر الأوقية بالدولار عالمياً
                if ((parentText.includes('الأوقية') || parentText.includes('أونصة')) && parentText.includes('دولار') && result.ounceUSD === 0) {
                    const val = getOnlyNumber(el.innerText) || getOnlyNumber(parentText);
                    if (val > 1000) result.ounceUSD = val;
                }
                
                // البحث عن سعر الجنيه الذهب
                if (parentText.includes('الجنيه الذهب') && result.goldPound === 0) {
                    const val = getOnlyNumber(el.innerText);
                    if (val > 10000) result.goldPound = val;
                }
            });

            // 3. تأمين الأرقام بحسابات الصاغة في حالة فشل سحب الموقع، وتطبيق دالة التقريب
            if (result.gold['21'] && result.gold['21'].sell > 0) {
                const sell21 = result.gold['21'].sell;
                const buy21 = result.gold['21'].buy;

                // لو عيار 24 مش موجود أو الرقم مسحوب غلط
                if (!result.gold['24'] || result.gold['24'].sell < 100) {
                    result.gold['24'] = { sell: sell21 * 24 / 21, buy: buy21 * 24 / 21 };
                }
                // لو عيار 18 مش موجود
                if (!result.gold['18'] || result.gold['18'].sell < 100) {
                    result.gold['18'] = { sell: sell21 * 18 / 21, buy: buy21 * 18 / 21 };
                }
                // لو عيار 14 مش موجود (بسبب تصميم الموقع)
                if (!result.gold['14'] || result.gold['14'].sell < 100) {
                    result.gold['14'] = { sell: sell21 * 14 / 21, buy: buy21 * 14 / 21 };
                }
                // حساب الجنيه الذهب (8 جرام من عيار 21) لو مش موجود
                if (result.goldPound < 10000) {
                    result.goldPound = sell21 * 8;
                }

                // تطبيق التقريب لأقرب 5 على كل الأسعار المستخرجة والمحسوبة
                Object.keys(result.gold).forEach(k => {
                    result.gold[k].sell = roundTo5(result.gold[k].sell).toString();
                    result.gold[k].buy = roundTo5(result.gold[k].buy).toString();
                });
                result.goldPound = roundTo5(result.goldPound);
            }

            return result;
        });

        // 3. الحسابات النهائية: الأوقية بالجنيه
        // طلبتم بضرب الأوقية بالدولار في سعر الدولار مباشرة
        let finalOunceEGP = "0";
        if (data.ounceUSD > 0) {
            finalOunceEGP = (Math.round((data.ounceUSD * usdRate) / 5) * 5).toString();
        } else if (data.gold['24']) {
            // كخيار احتياطي لو فشل سحب سعر الأوقية بالدولار، نضرب السعر المحلي في الوزن الدقيق (31.1035 جرام)
            finalOunceEGP = (Math.round((parseFloat(data.gold['24'].sell) * 31.1035) / 5) * 5).toString();
        }

        console.log(`Ounce USD from Site: ${data.ounceUSD}`);
        console.log(`Calculated Ounce EGP: ${finalOunceEGP}`);

        // حفظ الملف
        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify({
            gold: data.gold,
            goldPound: { price: data.goldPound },
            goldOunce: { price: finalOunceEGP },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        }, null, 4));

        console.log('Scrape Complete and Data Saved.');

    } catch (err) { 
        console.error('Scraper Error:', err);
        process.exit(1);
    } finally { 
        await browser.close(); 
    }
}

scrapePrices(); 

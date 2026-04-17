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
            
            // دالة لسحب الأرقام
            const getOnlyNumber = (text) => {
                if (!text) return 0;
                const cleaned = text.replace(/,/g, '');
                const match = cleaned.match(/\d+(\.\d+)?/);
                return match ? parseFloat(match[0]) : 0;
            };

            // دالة تقريب لأقرب 5 للأسعار بالجنيه (مثلاً 1203 -> 1205، 1201 -> 1200)
            const roundTo5 = (num) => Math.round(num / 5) * 5;

            // نلف على كل العناصر في الصفحة وندور على النصوص
            const allElements = Array.from(document.querySelectorAll('*'));
            
            // 1. استخراج أسعار العيارات
            for (let el of allElements) {
                if (el.children.length > 0) continue; // نبحث في النصوص النهائية فقط
                const text = el.innerText ? el.innerText.trim() : '';
                
                // لو لقينا كلمة بتدل على عيار
                let karst = null;
                if (text === 'الذهب عيار 24:' || text.includes('سعر الذهب عيار 24')) karst = '24';
                else if (text === 'الذهب عيار 21:' || text.includes('سعر الذهب عيار 21')) karst = '21';
                else if (text === 'الذهب عيار 18:' || text.includes('سعر الذهب عيار 18')) karst = '18';
                else if (text === 'الذهب عيار 14:' || text.includes('سعر الذهب عيار 14')) karst = '14';
                
                if (karst && !result.gold[karst]) {
                    // السعر غالباً بيكون في العناصر اللي قبله أو بعده أو في صندوق الأب
                    // طريقة أسهل: نأخذ قيم الشراء والبيع من العناصر القريبة منه اللي فيها .number-font
                    let container = el.closest('.row') || el.closest('.flex') || el.parentElement.parentElement;
                    if (container) {
                        let prices = Array.from(container.querySelectorAll('.number-font')).map(p => getOnlyNumber(p.innerText));
                        // لو ملقيناش، ندور في كل الأبناء
                        if (prices.length === 0) prices = Array.from(container.querySelectorAll('div, span')).map(x => getOnlyNumber(x.innerText)).filter(v => v > 100);
                        
                        if (prices.length >= 1) {
                            let sell = prices[0];
                            let buy = prices.length > 1 ? prices[1] : sell - 20;
                            // السعر الأكبر هو البيع دايماً (للعميل)
                            if (buy > sell) {
                                let temp = sell;
                                sell = buy;
                                buy = temp;
                            }
                            result.gold[karst] = { 
                                sell: roundTo5(sell).toString(), 
                                buy: roundTo5(buy).toString() 
                            };
                        }
                    }
                }

                // 2. الجنيه الذهب
                if ((text === 'الجنيه الذهب' || text.includes('سعر الجنيه الذهب')) && result.goldPound === 0) {
                    let container = el.closest('.row') || el.closest('.flex') || el.parentElement.parentElement;
                    if (container) {
                        let p = Array.from(container.querySelectorAll('.number-font')).map(p => getOnlyNumber(p.innerText));
                        if(p.length > 0 && p[0] > 10000) {
                            result.goldPound = roundTo5(p[0]);
                        }
                    }
                }

                // 3. الأوقية عالمياً
                if ((text.includes('الأوقية') || text.includes('أونصة')) && text.includes('دولار') && result.ounceUSD === 0) {
                    const val = getOnlyNumber(text);
                    if (val > 1000) result.ounceUSD = val;
                }
            }

            // حسابات احتياطية في حال فشل السحب
            if (result.gold['21']) {
                const sell21 = parseFloat(result.gold['21'].sell);
                const buy21 = parseFloat(result.gold['21'].buy);
                
                // حساب عيار 24 لو مش موجود
                if (!result.gold['24']) {
                    result.gold['24'] = {
                        sell: roundTo5(sell21 * 24 / 21).toString(),
                        buy: roundTo5(buy21 * 24 / 21).toString()
                    };
                }
                // حساب عيار 18 لو مش موجود
                if (!result.gold['18']) {
                    result.gold['18'] = {
                        sell: roundTo5(sell21 * 18 / 21).toString(),
                        buy: roundTo5(buy21 * 18 / 21).toString()
                    };
                }
                // حساب عيار 14 دائما للحصول على الدقة (أو لو مش موجود)
                if (!result.gold['14'] || parseFloat(result.gold['14'].sell) < 1000) {
                    result.gold['14'] = {
                        sell: roundTo5(sell21 * 14 / 21).toString(),
                        buy: roundTo5(buy21 * 14 / 21).toString()
                    };
                }
                
                // حساب الجنيه الذهب العرفي: 8 جرام من عيار 21
                if (result.goldPound === 0) {
                    result.goldPound = roundTo5(sell21 * 8);
                }
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

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
            const result = { gold: {}, goldPound: "0", ounceUSD: 0 };
            
            // دالة لسحب الأرقام فقط مع الحفاظ على العلامة العشرية
            const getOnlyNumber = (text) => {
                if (!text) return 0;
                // بياخد الرقم سواء كان فيه علامة عشرية (.) أو لا، ويشيل أي فواصل آلاف
                const cleaned = text.replace(/,/g, '');
                const match = cleaned.match(/\d+(\.\d+)?/);
                return match ? parseFloat(match[0]) : 0;
            };

            // الذهب بالعيار (24, 21, 18, 14)
            document.querySelectorAll('.price-item').forEach(item => {
                const label = item.innerText;
                const priceTags = item.querySelectorAll('.number-font');
                if (priceTags.length >= 1) {
                    const sell = getOnlyNumber(priceTags[0].innerText).toString();
                    const buy = priceTags[1] ? getOnlyNumber(priceTags[1].innerText).toString() : (parseFloat(sell) - 20).toString();
                    
                    if (label.includes('24') && !label.includes('2024')) result.gold['24'] = { sell, buy };
                    else if (label.includes('21')) result.gold['21'] = { sell, buy };
                    else if (label.includes('18')) result.gold['18'] = { sell, buy };
                    else if (label.includes('14')) result.gold['14'] = { sell, buy };
                }
            });

            // سحب سعر الأوقية بالدولار والجنيه الذهب من أي مكان في الصفحة
            document.querySelectorAll('div, span, p, b, strong').forEach(el => {
                const text = el.innerText;
                
                // البحث عن الجنيه الذهب
                if (text.includes('الجنيه الذهب') && result.goldPound === "0") {
                    const priceEl = el.parentElement.querySelector('.number-font') || el.querySelector('.number-font');
                    if (priceEl) result.goldPound = getOnlyNumber(priceEl.innerText).toString();
                }

                // البحث عن سعر الأوقية العالمي بالدولار
                if ((text.includes('الأوقية') || text.includes('أونصة')) && text.includes('دولار') && result.ounceUSD === 0) {
                    const val = getOnlyNumber(text);
                    if (val > 1000) result.ounceUSD = val;
                }
            });

            return result;
        });

        // 3. الحسابات النهائية: ضرب (الأوقية بالدولار من الموقع) × (سعر الدولار من جوجل)
        const finalOunceEGP = data.ounceUSD > 0 
            ? Math.round(data.ounceUSD * usdRate).toString() 
            : "0";

        console.log(`Ounce USD from Site: ${data.ounceUSD}`);
        console.log(`Calculating Ounce EGP: ${data.ounceUSD} * ${usdRate} = ${finalOunceEGP}`);

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

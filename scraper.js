const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Scraper: Final Precision Mode Starting...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const currencyRates = {};

    try {
        // 1. USD Rate from Google
        await page.goto('https://www.google.com/finance/quote/USD-EGP', { waitUntil: 'domcontentloaded' });
        const usdRate = await page.evaluate(() => {
            const el = document.querySelector('[data-last-price]');
            return el ? parseFloat(el.getAttribute('data-last-price')) : 51.0;
        });
        currencyRates['USD'] = usdRate;

        // 2. Gold from eDahab
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2' });
        const data = await page.evaluate(() => {
            const result = { gold: {}, goldPound: "0", ounceUSD: 0 };
            
            // Specific Karat scrap
            document.querySelectorAll('.price-item').forEach(item => {
                const label = item.innerText;
                const priceTags = item.querySelectorAll('.number-font');
                if (priceTags.length >= 1) {
                    // Extract ONLY numbers from the price tag to avoid mixed strings
                    const sell = priceTags[0].innerText.replace(/[^0-9]/g, '');
                    const buy = priceTags[1] ? priceTags[1].innerText.replace(/[^0-9]/g, '') : (parseInt(sell) - 20).toString();
                    
                    if (label.includes('24') && !label.includes('2024')) result.gold['24'] = { sell, buy };
                    else if (label.includes('21')) result.gold['21'] = { sell, buy };
                    else if (label.includes('18')) result.gold['18'] = { sell, buy };
                    else if (label.includes('14')) result.gold['14'] = { sell, buy };
                }
            });

            // Specific Pound and Ounce USD scrap
            document.querySelectorAll('div, span, p').forEach(el => {
                const t = el.innerText;
                if (t.includes('الجنيه الذهب') && result.goldPound === "0") {
                    const pEl = el.parentElement.querySelector('.number-font')  el.querySelector('.number-font');
                    if (pEl) {
                        const val = pEl.innerText.replace(/[^0-9]/g, '');
                        if (parseInt(val) > 10000) result.goldPound = val;
                    }
                }
                if ((t.includes('الأوقية')  t.includes('أونصة')) && result.ounceUSD === 0) {
                    const pEl = el.parentElement.querySelector('.number-font') || el.querySelector('.number-font');
                    if (pEl) {
                        const val = parseFloat(pEl.innerText.replace(/[^0-9.]/g, ''));
                        // Reality check: Ounce USD is between 1000 and 6000
                        if (val > 1000 && val < 6000) result.ounceUSD = val;
                    }
                }
            });
            return result;
        });

        // 3. Final calculations
        const finalOunceEGP = data.ounceUSD > 0 ? Math.round(data.ounceUSD * usdRate).toString() : "0";
        
        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify({
            gold: data.gold,
            goldPound: { price: data.goldPound },
            goldOunce: { price: finalOunceEGP },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        }, null, 4));

        console.log('Scrape Complete. Ounce EGP:', finalOunceEGP);

    } catch (err) { console.error(err); process.exit(1); }
    finally { await browser.close(); }
}
scrapePrices();
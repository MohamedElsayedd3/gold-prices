const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Ounce from eDahab, Multiplied by Google USD Rate)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Fetch Precise USD Rate from Google Finance
        for (var i = 0; i < currenciesToFetch.length; i++) {
            var symbol = currenciesToFetch[i];
            try {
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 20000 });
                const rate = await page.evaluate(function() {
                    var el = document.querySelector('[data-last-price]');
                    return el ? parseFloat(el.getAttribute('data-last-price')) : null;
                });
                if (rate) currencyRates[symbol] = rate;
            } catch (e) { }
        }

        // 2. Fetch Gold Prices & the Ounce USD price from eDahab
        console.log('Fetching data from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const scrapedData = await page.evaluate(function() {
            var data = { gold: {}, ounceUSD: 0 };
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            }

            // Scrape Karat Prices
            var items = document.querySelectorAll('.price-item');
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                var text = item.innerText;
                var nums = item.querySelectorAll('.number-font');
                if (nums.length >= 1) {
                    var sell = cleanNum(nums[0].innerText).toString();
                    var buy = (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText) - 20).toString();
                    if (text.includes('عيار 24')) data.gold['24'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 21')) data.gold['21'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 18')) data.gold['18'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 14')) data.gold['14'] = { sell: sell, buy: buy };
                }
            }

            // Locate "الأوقية" and extract its USD value
            var allElements = document.querySelectorAll('div, span, p');
            for (var k = 0; k < allElements.length; k++) {
                var el = allElements[k];
                var txt = el.innerText;
                if (txt.includes('الأوقية') || txt.includes('أونصة')) {
                    // Extract number from text like "الأوقية عالمياً 4793 دولار"
                    var priceText = txt.replace(/[^0-9.]/g, '');
                    var val = parseFloat(priceText);
                    if (!isNaN(val) && val > 100) {
                        data.ounceUSD = val;
                        break;
                    }
                }
            }
            return data;
        });

        // 3. Final Calculations
        var usdRate = currencyRates['USD'] || 50;
        var goldDataOunce = { price: "0" };
        var goldDataPound = { price: "0" };
        
        // Calculation requested: (Ounce USD from site) * (USD Rate from Google)
        if (scrapedData.ounceUSD > 0) {
            goldDataOunce = { price: Math.round(scrapedData.ounceUSD * usdRate).toString() };
        } else if (scrapedData.gold['24']) {
            goldDataOunce = { price: Math.round(parseInt(scrapedData.gold['24'].sell) * 31.1035).toString() };
        }

        // Gold Pound = 8g of 21K
        if (scrapedData.gold['21']) {
            goldDataPound = { price: (parseInt(scrapedData.gold['21'].sell) * 8).toString() };
        }

        const finalOutput = {
            gold: scrapedData.gold,
            goldPound: goldDataPound,
            goldOunce: goldDataOunce,
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Custom Ounce Calculation applied)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();

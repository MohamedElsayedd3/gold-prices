const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Gold: eDahab, Currencies: Google Finance)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Fetch Currency Rates from Google Finance
        for (var i = 0; i < currenciesToFetch.length; i++) {
            var symbol = currenciesToFetch[i];
            try {
                console.log('Fetching ' + symbol + '-EGP from Google...');
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 30000 });
                const rate = await page.evaluate(function() {
                    var priceElement = document.querySelector('[data-last-price]');
                    return priceElement ? parseFloat(priceElement.getAttribute('data-last-price')) : null;
                });
                if (rate) {
                    currencyRates[symbol] = rate;
                    console.log(symbol + ': ' + rate);
                }
            } catch (err) {
                console.warn('Could not fetch ' + symbol + ': ' + err.message);
            }
        }

        // 2. Fetch Gold Prices from eDahab
        console.log('Fetching gold prices from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const goldData = await page.evaluate(function() {
            var data = { gold: {} };
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            }

            var items = document.querySelectorAll('.price-item');
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                var text = item.innerText;
                var nums = item.querySelectorAll('.number-font');
                if (nums.length >= 1) {
                    var sell = cleanNum(nums[0].innerText);
                    var buy = nums[1] ? cleanNum(nums[1].innerText) : (sell - 20);
                    
                    if (text.indexOf('24') !== -1) data.gold['24'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('21') !== -1) data.gold['21'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('18') !== -1) data.gold['18'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('14') !== -1) data.gold['14'] = { sell: sell.toString(), buy: buy.toString() };
                }
            }

            // Logic check for local Market
            if (data.gold['21']) {
                data.goldPound = { price: (parseInt(data.gold['21'].sell) * 8).toString() };
            }
            if (data.gold['24']) {
                data.goldOunce = { price: Math.round(parseInt(data.gold['24'].sell) * 31.1035).toString() };
            }

            return data;
        });

        // 3. Save Everything to prices.json
        const finalOutput = {
            gold: goldData.gold,
            goldPound: goldData.goldPound,
            goldOunce: goldData.goldOunce,
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful with Google Finance rates!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
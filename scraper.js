const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Expert Content Match: eDahab + Google Finance)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};
    let globalOunceUSD = 0;

    try {
        // 1. Fetch Currency Rates + Global Gold Ounce USD from Google Finance
        for (var i = 0; i < currenciesToFetch.length; i++) {
            var symbol = currenciesToFetch[i];
            try {
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 30000 });
                const rate = await page.evaluate(function() {
                    var el = document.querySelector('[data-last-price]');
                    return el ? parseFloat(el.getAttribute('data-last-price')) : null;
                });
                if (rate) currencyRates[symbol] = rate;
            } catch (e) { }
        }

        // Fetch Global Gold Ounce (XAU-USD)
        try {
            await page.goto('https://www.google.com/finance/quote/XAU-USD', { waitUntil: 'domcontentloaded' });
            globalOunceUSD = await page.evaluate(function() {
                var el = document.querySelector('[data-last-price]');
                return el ? parseFloat(el.getAttribute('data-last-price')) : null;
            });
        } catch (e) { }

        // 2. Fetch Gold Prices from eDahab with Expert Text-Match Search
        console.log('Fetching gold prices from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const goldData = await page.evaluate(function() {
            var data = { gold: {} };
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            }

            // Expert search to find prices by label text even in complex layouts
            var allElements = document.querySelectorAll('div, span, p, h1, h2, h3');
            for (var k = 0; k < allElements.length; k++) {
                var el = allElements[k];
                var txt = el.innerText.trim();
                
                // Karat 24
                if (txt.includes('24') && !data.gold['24']) {
                    var nums = el.closest('.price-item')?.querySelectorAll('.number-font') || el.parentElement.querySelectorAll('.number-font');
                    if (nums && nums.length > 0) data.gold['24'] = { sell: cleanNum(nums[0].innerText).toString(), buy: (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText)-20).toString() };
                }
                // Karat 21
                if (txt.includes('21') && !data.gold['21']) {
                    var nums = el.closest('.price-item')?.querySelectorAll('.number-font') || el.parentElement.querySelectorAll('.number-font');
                    if (nums && nums.length > 0) data.gold['21'] = { sell: cleanNum(nums[0].innerText).toString(), buy: (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText)-15).toString() };
                }
                // Karat 18
                if (txt.includes('18') && !data.gold['18']) {
                    var nums = el.closest('.price-item')?.querySelectorAll('.number-font') || el.parentElement.querySelectorAll('.number-font');
                    if (nums && nums.length > 0) data.gold['18'] = { sell: cleanNum(nums[0].innerText).toString(), buy: (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText)-10).toString() };
                }
                // Karat 14 (Special improved detection)
                if (txt.includes('14') && !data.gold['14']) {
                    var nums = el.closest('.price-item')?.querySelectorAll('.number-font') || el.parentElement.querySelectorAll('.number-font');
                    if (nums && nums.length > 0) data.gold['14'] = { sell: cleanNum(nums[0].innerText).toString(), buy: (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText)-10).toString() };
                }
            }
            return data;
        });

        // 3. Robust Gold Price Fallbacks and Calculations
        var usdRate = currencyRates['USD'] || 49.50;
        
        // Final Ounce Logic (Prioritize Google-based Global Price * Google USD Rate)
        if (globalOunceUSD > 0) {
            goldData.goldOunce = { price: Math.round(globalOunceUSD * usdRate).toString() };
        } else if (goldData.gold['24']) {
            goldData.goldOunce = { price: Math.round(parseInt(goldData.gold['24'].sell) * 31.1035).toString() };
        }

        // Final Gold Pound Logic (8g of 21K Sell Price)
        if (goldData.gold['21']) {
            goldData.goldPound = { price: (parseInt(goldData.gold['21'].sell) * 8).toString() };
        }

        const finalOutput = {
            gold: goldData.gold,
            goldPound: goldData.goldPound,
            goldOunce: goldData.goldOunce,
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Expert Search Mode)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();

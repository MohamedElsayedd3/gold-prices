const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function scrapePrices() {
    console.log('Starting scraper...');
    
    let usdToEgp = 49.50;
    try {
        const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        if (response.data && response.data.rates && response.data.rates.EGP) {
            usdToEgp = response.data.rates.EGP;
            console.log('Fetched USD/EGP rate:', usdToEgp);
        }
    } catch (err) {
        console.warn('Failed to fetch currency rate, using fallback:', usdToEgp);
    }

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        console.log('Navigating to edahabapp.com...');
        await page.goto('https://edahabapp.com/', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        console.log('Extracting data...');
        const prices = await page.evaluate(function(usdRate) {
            var data = { gold: {} };
            var items = document.querySelectorAll('.price-item');
            
            function cleanValue(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            }

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var titleContainer = item.querySelector('span.font-medium, span.font-semibold');
                var title = titleContainer ? titleContainer.innerText : "";
                var valElements = item.querySelectorAll('.number-font');
                
                if (valElements.length > 0) {
                    if (title.indexOf('24') !== -1) {
                        data.gold['24'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.indexOf('21') !== -1) {
                        data.gold['21'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.indexOf('18') !== -1) {
                        data.gold['18'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.indexOf('14') !== -1) {
                        data.gold['14'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.indexOf('جنيه') !== -1) {
                        data.goldPound = { price: cleanValue(valElements[0].innerText).toString() };
                    } else if (title.indexOf('أونصة') !== -1 || title.indexOf('اونصة') !== -1) {
                        var rawVal = valElements[0].innerText.replace(/[^0-9.]/g, '');
                        var ounceUSD = parseFloat(rawVal);
                        if (!isNaN(ounceUSD)) {
                            data.goldOunce = { price: Math.round(ounceUSD * usdRate).toString() };
                        }
                    }
                }
            }
if (!data.goldOunce && data.gold['24']) {
                data.goldOunce = { price: Math.round(parseInt(data.gold['24'].sell) * 31.1035).toString() };
            }

            return data;
        }, usdToEgp);

        if (Object.keys(prices.gold).length > 0) {
            const filePath = path.join(__dirname, 'prices.json');
            fs.writeFileSync(filePath, JSON.stringify(prices, null, 4));
            console.log('Successfully updated prices.json');
        } else {
            throw new Error('No prices found');
        }

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
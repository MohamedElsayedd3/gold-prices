const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function scrapePrices() {
    console.log('Starting scraper...');
    
    // 1. جلب سعر الدولار أولاً من الـ API
    let usdToEgp = 49.50; // قيمة افتراضية في حال فشل الـ API
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
        const prices = await page.evaluate((usdRate) => {
            const data = { gold: {} };
            const items = document.querySelectorAll('.price-item');
            
            const cleanValue = (txt) => {
                let num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            };

            items.forEach(item => {
                const title = item.querySelector('span.font-medium, span.font-semibold')?.innerText  "";
                const valElements = item.querySelectorAll('.number-font');
                
                if (valElements.length > 0) {
                    if (title.includes('24')) {
                        data.gold['24'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.includes('21')) {
                        data.gold['21'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.includes('18')) {
                        data.gold['18'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.includes('14')) {
                        data.gold['14'] = { 
                            sell: cleanValue(valElements[0].innerText).toString(), 
                            buy: (valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) - 15).toString() 
                        };
                    } else if (title.includes('جنيه')) {
                        data.goldPound = { price: cleanValue(valElements[0].innerText).toString() };
                    } else if (title.includes('أونصة')  title.includes('اونصة')) {
                        // إذا كانت الأونصة بالدولار (تحتوي على علامة $) أو حسب سياق الموقع
                        let rawVal = valElements[0].innerText.replace(/[^0-9.]/g, '');
                        let ounceUSD = parseFloat(rawVal);
                        if (!isNaN(ounceUSD)) {
                            // تحويل السعر للجنيه المصري بناءً على السعر المجلوب
                            data.goldOunce = { price: Math.round(ounceUSD * usdRate).toString() };
                        }
                    }
                }
            });
//Fallback للأونصة لو لم نجدها في الموقع بشكل صريح
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
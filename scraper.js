const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting scraper...');
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
        const prices = await page.evaluate(() => {
            const data = { gold: {} };
            const items = document.querySelectorAll('.price-item');
            
            items.forEach(item => {
                const title = item.querySelector('span.font-medium, span.font-semibold')?.innerText || "";
                const valElements = item.querySelectorAll('.number-font');
                
                if (valElements.length > 0) {
                    const cleanValue = (txt) => {
                        let num = parseInt(txt.replace(/[^0-9]/g, ''));
                        if (isNaN(num)) return "0";
                        // التقريب لأقرب 5 جنيهات
                        return (Math.round(num / 5) * 5).toString();
                    };
                    
                    if (title.includes('24')) {
                        data.gold['24'] = { 
                            sell: cleanValue(valElements[0].innerText), 
                            buy: valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) 
                        };
                    } else if (title.includes('21')) {
                        data.gold['21'] = { 
                            sell: cleanValue(valElements[0].innerText), 
                            buy: valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) 
                        };
                    } else if (title.includes('18')) {
                        data.gold['18'] = { 
                            sell: cleanValue(valElements[0].innerText), 
                            buy: valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) 
                        };
                    } else if (title.includes('14')) {
                        data.gold['14'] = { 
                            sell: cleanValue(valElements[0].innerText), 
                            buy: valElements[1] ? cleanValue(valElements[1].innerText) : cleanValue(valElements[0].innerText) 
                        };
                    } else if (title.includes('جنيه')) {
                        data.goldPound = { price: cleanValue(valElements[0].innerText) };
                    }
                }
            });

            // Calculate Ounce based on 24k if not found directly
            if (data.gold['24'] && data.gold['24'].sell) {
                data.goldOunce = { price: Math.round(parseInt(data.gold['24'].sell) * 31.1035).toString() };
            }

            return data;
        });

        if (Object.keys(prices.gold).length > 0) {
            const filePath = path.join(__dirname, 'prices.json');
            fs.writeFileSync(filePath, JSON.stringify(prices, null, 4));
            console.log('Successfully updated prices.json at:', filePath);
            console.log('Data:', JSON.stringify(prices));
        } else {
            throw new Error('No gold prices found on the page. Selectors might have changed.');
        }

    } catch (error) {
        console.error('Fatal Scraper Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();

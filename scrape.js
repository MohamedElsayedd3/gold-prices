"21": {sell: 3522, buy: 3482}, 
                "18": {sell: 3019, buy: 2979} 
            },
            silver: { 
                "999": {sell: 47, buy: 44}, 
                "925": {sell: 43, buy: 40}, 
                "800": {sell: 37, buy: 34} 
            },
            usdToEgp: 49.10
        };
        fs.writeFileSync('prices.json', JSON.stringify(defaultPrices, null, 2));
    }
}

function extractPrice($, selectors) {
    for (let selector of selectors) {
        try {
            const element = $(selector).first();
            if (element.length) {
                const text = element.text().replace(/[^0-9.]/g, '');
                const price = parseFloat(text);
                if (price > 1000) return Math.round(price);
            }
        } catch (e) {}
    }
    return null;
}

scrapePrices();

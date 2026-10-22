(function (root) {
  'use strict';

  var CATEGORIES = ['Groceries', 'Food & Dining', 'Transport & Fuel', 'Shopping', 'Health', 'Utilities & Bills', 'Entertainment', 'Travel', 'Office & Business', 'Other'];
  var CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD', 'SGD', 'AED'];
  var MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  var SMALL = ['THE', 'AND', 'OF', 'FOR', 'NEW', 'BIG', 'TOP', 'BAR', 'INN', 'PUB', 'HUT', 'BAY', 'SUN', 'CO', 'DAY', 'OLD', 'RED', 'HOT', 'CUP', 'TEA', 'ALL', 'ONE', 'TWO', 'MY', 'OUR', 'BY', 'AT', 'IN', 'ON', 'TO', 'DE', 'LA', 'LE', 'DU', 'SON', 'BUN', 'PET', 'CAR', 'GAS', 'OIL', 'BUS', 'BED', 'SPA', 'ART', 'BOX', 'MAX', 'WAY', 'FIT', 'JOY', 'KEY', 'MAN', 'MEN', 'FUN', 'EYE', 'ICE', 'PAN', 'POT', 'JET', 'SKY', 'SEA', 'GEM', 'HUB', 'CAB', 'VAN', 'MR', 'DR', 'MRS'];
  var KEYWORDS = {
    'Groceries': ['supermarket', 'super market', 'keells', 'cargills', 'food city', 'arpico', 'laugfs super', 'spar', 'glomark', 'grocery', 'groceries', 'vegetables', 'vegetable', 'rice', 'dhal', 'dal', 'milk powder', 'milk', 'sugar', 'flour', 'eggs', 'bread', 'banana', 'fruits', 'anchor', 'tesco', 'sainsbury', 'asda', 'walmart', 'aldi', 'lidl', 'carrefour', 'lulu', 'woolworths', 'coles', 'fairprice', 'dmart', 'whole foods', 'kroger'],
    'Food & Dining': ['restaurant', 'cafe', 'caf\u00E9', 'caffe', 'coffee', 'cappuccino', 'bakery', 'bakers', 'bakehouse', 'hotel', 'kfc', 'pizza hut', 'pizza', 'mcdonald', 'burger', 'burger king', 'kottu', 'dine-in', 'dine in', 'takeaway', 'take away', 'service charge', 'biryani', 'noodles', 'juice', 'tea', 'chai', 'samosa', 'toast', 'kopitiam', 'cake', 'pastry', 'dining', 'eatery', 'bistro', 'grill', 'kitchen', 'food court', 'catering', 'perera & sons', 'domino', 'subway', 'starbucks', 'java lounge', 'barista', 'waiter', 'meal'],
    'Transport & Fuel': ['fuel', 'petrol', 'diesel', 'octane', 'ceypetco', 'ceylon petroleum', 'lanka ioc', 'ioc', 'filling station', 'fuel station', 'service station', 'gas station', 'shed', 'parking', 'taxi', 'cab', 'pickme', 'uber', 'grab', 'toll', 'expressway', 'litre', 'ltr', 'shell', 'chevron', 'tuk', 'three wheeler', 'fare', 'trip'],
    'Shopping': ['fashion', 'fashions', 'clothing', 'odel', 'cool planet', 'nolimit', 'no limit', 'fashion bug', 'electronics', 'singer', 'abans', 'softlogic', 'hardware', 'damro', 'apparel', 'boutique', 'textile', 'jewellery', 'jewellers', 'shoes', 'footwear', 'mall', 'ikea', 'amazon', 'daraz'],
    'Health': ['pharmacy', 'pharmacies', 'chemist', 'hospital', 'clinic', 'channelling', 'channeling', 'lab', 'laboratory', 'osu sala', 'osusala', 'healthguard', 'medical', 'medicine', 'tablet', 'tab', 'capsule', 'syrup', 'doctor', 'dental', 'asiri', 'nawaloka', 'durdans', 'hemas', 'panadol', 'paracetamol', 'vitamin', 'mg', 'cvs', 'walgreens', 'boots', 'apollo'],
    'Utilities & Bills': ['electricity', 'ceb', 'leco', 'water board', 'nwsdb', 'water bill', 'dialog', 'axiata', 'mobitel', 'slt', 'hutch', 'airtel', 'broadband', 'reload', 'bill payment', 'telecom', 'internet', 'fibre', 'postpaid', 'kwh', 'utility', 'utilities'],
    'Entertainment': ['cinema', 'cinemas', 'scope', 'movie', 'ticket', 'game', 'theatre', 'theater', 'concert', 'netflix', 'spotify', 'bowling', 'arcade', 'pvr', 'imax'],
    'Travel': ['airline', 'srilankan airlines', 'flight', 'airport', 'booking', 'hotel room', 'room charge', 'resort', 'lodge', 'guest house', 'villa', 'bus ticket', 'railway', 'train', 'accommodation', 'agoda', 'airbnb', 'expedia', 'boarding pass'],
    'Office & Business': ['stationery', 'stationary', 'print', 'printing', 'photocopy', 'photo copy', 'courier', 'office', 'software', 'paper', 'a4', 'toner', 'cartridge', 'pen', 'bookshop', 'book shop', 'sarasavi', 'vijitha yapa', 'staples', 'domex', 'dhl', 'fedex', 'pronto', 'hosting', 'domain']
  };

  var CUR_RE = /\brs(?![a-z])|\blkr\b|[$\u20AC\u00A3\u20B9]|\b(usd|eur|gbp|inr|aed|aud|sgd|dhs)\b|\u0DBB\u0DD4/i;
  var EXCL_C = /SUBTOT|TOTALQ|QTY|TOTALITEM|NOOFITEM|ITEMCOUNT|SAVING|D[IL]SCOUNT|CHANGE|TENDER|SSCL|SERVICECH|INVOICENO|BILLNO|RECEIPTNO|ORDERNO|ACCOUNTNO|ACCNO|TOTALWEIGHT|ROUNDING|ROUNDOFF|PO[IL]NTS|LOYALTY|BEFORE/;
  var EXCL_W = / (CASH|CARD|VISA|MASTER|MASTERCARD|AMEX|EFTPOS|BALANCE|BAL|TEL|TP|PHONE|FAX|MOBILE|HOTLINE|INV|REF|NO|TID|MID|RRN|AUTH|APPR|BATCH|TXN|TRACE|TABLE|PAX|SEATS?) /;
  var TAX_W = / (TAX|TAXES|VAT|GST|CGST|SGST|IGST|NBT|MWST|IVA) /;
  var SHOP_BAD = /\b(tel|tp|phone|fax|mobile|hotline|whatsapp|e-?mail|www|https?|vat|tin|gst|gstin|trn|abn|uen|reg|regd|registration|tax|invoice|receipt|welcome|thank|thanks|bill|date|time|cashier|counter|terminal|order|table|copy|original|duplicate|customer|qty|item|items|price|amount|total|pos)\b|\.com|\.lk|@/i;
  var ADDR = /\b(no\.?\s*\d+|road|rd|street|mawatha|mw|lane|avenue|ave|place|junction|jn|floor|building|colombo\s*-?\s*\d+|p\.?\s*o\.?\s*box)\b/i;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function prep(line) {
    var s = String(line).replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').trim();
    s = s.replace(/\b(rs|lkr|usd|inr|aed|eur|gbp|aud|sgd|dhs)\.?(?=\d)/gi, '$& ').replace(/([$\u20AC\u00A3\u20B9])(?=\d)/g, '$1 ');
    s = s.split(' ').map(function (t) {
      return /\d/.test(t) && /^[0-9OoIl|S.,\/:=\-]+$/.test(t) ? t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5') : t;
    }).join(' ');
    return s.replace(/(\d)\s+([.,])\s*(\d{2})(?![\d:])/g, '$1$2$3').replace(/(\d)\.\s+(\d{2})(?![\d:])/g, '$1.$2');
  }

  function label(s) {
    var w = s.split(' ').filter(function (t) { return /[A-Za-z]/.test(t); }).map(function (t) {
      return t.toUpperCase().replace(/0/g, 'O').replace(/[1|]/g, 'L').replace(/5/g, 'S').replace(/[^A-Z]/g, '');
    });
    return { w: ' ' + w.join(' ') + ' ', c: w.join('') };
  }

  function num(str) {
    var i = Math.max(str.lastIndexOf('.'), str.lastIndexOf(',')), head = str.slice(0, i), tail = str.slice(i + 1), v;
    if (i < 0) v = +str;
    else if (tail.length <= 2 && /^(\d{1,3}([.,]\d{3})*|\d+)$/.test(head)) v = +(head.replace(/[.,]/g, '') + '.' + tail);
    else if (tail.length === 3 && /^\d{1,3}([.,]\d{3})*$/.test(head)) v = +(head.replace(/[.,]/g, '') + tail);
    else return null;
    return isFinite(v) ? { v: Math.round(v * 100) / 100, dec: i >= 0 && tail.length === 2 } : null;
  }

  function money(s) {
    var t = s.replace(/\b\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, ' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
      .replace(/\d+([.,]\d+)?\s*%/g, ' ').replace(/\/[=\-]/g, ' ').replace(/\d{7,}/g, ' ');
    var out = [], re = /\d[\d.,]*\d|\d/g, m, v;
    while ((m = re.exec(t))) if ((v = num(m[0]))) out.push(v);
    return out;
  }

  function analyze(line) {
    var s = prep(line), lb = label(s);
    var a = { s: s, w: lb.w, c: lb.c, nums: money(s), cur: CUR_RE.test(s) };
    a.ex = EXCL_C.test(a.c) || (EXCL_W.test(a.w) && !/BALANCEDUE/.test(a.c)) || (TAX_W.test(a.w) && !/ INC(L|LD|LUSIVE|LUDING)? /.test(a.w));
    return a;
  }

  function rank(a) {
    if (/GRANDTOTA|NETTOTA|NETAMOUNT|NETPAYABLE|TOTALNET/.test(a.c)) return 3;
    if (/AMOUNTDUE|BALANCEDUE|TOTALDUE|PAYABLE|AMOUNTTOPAY/.test(a.c) || / TO PAY /.test(a.w)) return 2;
    if (/TOTA[LI]|SUMME|TOTAAL|AMOUNTPAID|PAIDAMOUNT|PAYMENTAMOUNT/.test(a.c) || / TTL /.test(a.w)) return 1;
    return 0;
  }

  function pick(nums) {
    var d = nums.filter(function (n) { return n.dec; }), arr = d.length ? d : nums;
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i].v > 0) return arr[i].v;
    return null;
  }

  function findAmount(an) {
    var best = null, n = an.length, i, r, v, max = null;
    for (i = 0; i < n; i++) {
      r = an[i].ex ? 0 : rank(an[i]);
      if (!r) continue;
      v = pick(an[i].nums);
      if (v === null && i + 1 < n && !an[i + 1].ex) v = pick(an[i + 1].nums);
      if (v !== null && v < 1e8 && (!best || r >= best.r)) best = { r: r, v: v };
    }
    if (best) return best.v;
    for (i = Math.floor(n * 0.4); i < n; i++) {
      if (an[i].ex) continue;
      for (var j = 0; j < an[i].nums.length; j++) {
        var x = an[i].nums[j];
        if ((x.dec || an[i].cur) && x.v > 0 && x.v < 1e8 && (max === null || x.v > max)) max = x.v;
      }
    }
    return max;
  }

  function mk(y, m, d, lim) {
    if (y < 100) y += 2000;
    if (y < 2000 || m < 1 || m > 12 || d < 1) return '';
    var t = Date.UTC(y, m - 1, d);
    return new Date(t).getUTCDate() === d && t <= lim ? y + '-' + pad(m) + '-' + pad(d) : '';
  }

  function datesIn(s, lim, usd) {
    var out = [], m, re, dm, md;
    function add(x) { if (x) out.push(x); }
    re = /\b(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/g;
    while ((m = re.exec(s))) add(mk(+m[1], +m[2], +m[3], lim));
    re = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/g;
    while ((m = re.exec(s))) {
      dm = mk(+m[3], +m[2], +m[1], lim);
      md = mk(+m[3], +m[1], +m[2], lim);
      add(usd ? md || dm : dm || md);
    }
    re = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,']*([A-Za-z]{3,9})\.?[\s\-\/.,']*(\d{4}|\d{2})(?!\d)/g;
    while ((m = re.exec(s))) if (MONTHS[m[2].toLowerCase()]) add(mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1], lim));
    re = /\b([A-Za-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})(?!\d)/g;
    while ((m = re.exec(s))) if (MONTHS[m[1].toLowerCase()]) add(mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2], lim));
    return out;
  }

  function findDate(an, lim, usd) {
    var first = '';
    for (var i = 0; i < an.length; i++) {
      var ds = datesIn(an[i].s, lim, usd);
      if (!ds.length) continue;
      if (/\b(date|dated|dt)\b/i.test(an[i].s)) return ds[0];
      if (!first) first = ds[0];
    }
    return first;
  }

  function title(s) {
    if (/[a-z]/.test(s)) return s;
    return s.split(' ').map(function (w) {
      var l = w.replace(/[^A-Z]/g, '');
      if (l && l.length <= 3 && SMALL.indexOf(l) < 0) return w;
      return w.toLowerCase().replace(/[a-z\u00E0-\u024F]/, function (x) { return x.toUpperCase(); });
    }).join(' ');
  }

  function findShop(lines) {
    for (var i = 0; i < lines.length && i < 6; i++) {
      var c = lines[i].replace(/[^A-Za-z0-9\u00C0-\u024F&'.,()\-\/ ]+/g, ' ').replace(/^[^A-Za-z0-9\u00C0-\u024F]+/, '')
        .replace(/[^A-Za-z0-9\u00C0-\u024F.)']+$/, '').replace(/\s+/g, ' ').trim();
      var L = (c.match(/[A-Za-z\u00C0-\u024F]/g) || []).length, ns = c.replace(/ /g, '').length;
      if (L < 3 || L / ns < 0.6 || !/[A-Za-z\u00C0-\u024F]{3,}/.test(c) || SHOP_BAD.test(c) || ADDR.test(c) || (/\d/.test(c) && /\bst\b/i.test(c))) continue;
      return title(c).slice(0, 40).trim();
    }
    return '';
  }

  function detectCurrency(t) {
    if (/\bAED\b|\bDHS\b|\bDIRHAMS?\b/i.test(t)) return 'AED';
    if (/\bAUD\b|(^|[^A-Za-z])A\$|AU\$/.test(t)) return 'AUD';
    if (/\bSGD\b|(^|[^A-Za-z])S\$/.test(t)) return 'SGD';
    if (/\u20B9|\bINR\b|\bGSTIN\b|\bCGST\b|\bSGST\b/i.test(t)) return 'INR';
    if (/\u20AC|\bEUR\b|\bEURO\b/i.test(t)) return 'EUR';
    if (/\u00A3|\bGBP\b/i.test(t)) return 'GBP';
    if (/\bLKR\b|\bRs(?![a-z])|\u0DBB\u0DD4|\bSLRs?\b/i.test(t)) return 'LKR';
    if (/\$|\bUSD\b/i.test(t)) return /\bABN\b/.test(t) ? 'AUD' : /\bUEN\b/.test(t) ? 'SGD' : 'USD';
    return '';
  }

  function esc(k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'); }

  function hits(text, list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (new RegExp('(^|[^a-z0-9])' + esc(list[i]) + 's?(?![a-z0-9])').test(text)) n++;
    return n;
  }

  function categorize(shop, text) {
    var best = 'Other', bs = 0, tie = false, sh = shop.toLowerCase(), tx = text.toLowerCase();
    for (var cat in KEYWORDS) {
      if (!Object.prototype.hasOwnProperty.call(KEYWORDS, cat)) continue;
      var s = 3 * hits(sh, KEYWORDS[cat]) + hits(tx, KEYWORDS[cat]);
      if (s > bs) { bs = s; best = cat; tie = false; } else if (s === bs && s > 0) tie = true;
    }
    return tie || !bs ? 'Other' : best;
  }

  function blank(cur) { return { date: '', shop: '', amount: null, currency: cur, category: 'Other' }; }

  function parse(text, opts) {
    var def = 'LKR';
    try {
      opts = opts && typeof opts === 'object' ? opts : {};
      var dc = String(opts.defaultCurrency || '').toUpperCase();
      if (CURRENCIES.indexOf(dc) >= 0) def = dc;
      var t = opts.today instanceof Date && !isNaN(opts.today.getTime()) ? opts.today : new Date();
      var lim = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      var raw = text == null ? '' : String(text);
      var lines = raw.split(/\r\n|\r|\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
        .filter(function (l) { return /[A-Za-z0-9]/.test(l); });
      var an = lines.map(analyze), r = blank(def);
      r.currency = detectCurrency(raw) || def;
      r.amount = findAmount(an);
      r.date = findDate(an, lim, r.currency === 'USD');
      r.shop = findShop(lines);
      r.category = categorize(r.shop, raw);
      return r;
    } catch (e) {
      return blank(def);
    }
  }

  var api = { parse: parse, CATEGORIES: CATEGORIES.slice(), CURRENCIES: CURRENCIES.slice() };
  root.ReceiptParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);

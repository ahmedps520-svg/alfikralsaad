/* الفكر الساعد — Arabic / English switch.
 * Arabic is the source language: the UI is written in Arabic, and when English is chosen this
 * file translates the rendered page (text, placeholders, labels) using the dictionary below,
 * flips the layout to left-to-right, and switches date/number formatting. Names, sites and
 * other data typed by people are left as they are.
 */
(function () {
  const KEY = 'fikr.lang';
  const AR = /[؀-ۿ]/;
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  const EN = {
    // brand & static pages
    'الفكر الساعد': 'Alfikr Alsaad',
    'الفكر الساعد · الحضور': 'Alfikr Alsaad · Attendance',
    'الفكر الساعد · لوحة التحكم': 'Alfikr Alsaad · Admin',
    'الفكر الساعد · نظام الحضور والانصراف': 'Alfikr Alsaad · Attendance system',
    'سجّل حضورك بلمسة واحدة': 'Check in with one tap',
    'تسجيل الدخول': 'Sign in',
    'أدخل رقم جوالك والرمز السري الذي زوّدك به المسؤول': 'Enter your mobile number and the PIN your manager gave you',
    'رقم الجوال': 'Mobile number',
    'الرمز السري': 'PIN',
    'دخول': 'Sign in',
    'هل أنت مسؤول؟': 'Are you an admin?',
    'لوحة التحكم': 'Admin dashboard',
    'التنقل': 'Navigation',
    'الرئيسية': 'Home',
    'سجلي': 'My log',
    'حسابي': 'Account',
    'إدارة الحضور والموظفين — الفكر الساعد': 'Attendance & staff management — Alfikr Alsaad',
    'دخول المسؤول': 'Admin sign in',
    'أدخل كلمة مرور لوحة التحكم': 'Enter the dashboard password',
    'كلمة المرور': 'Password',
    'تطبيق الموظفين ←': '← Employee app',
    'اليوم': 'Today',
    'الموظفون': 'Employees',
    'السجلات': 'Records',
    'الإعدادات': 'Settings',
    'اللغة': 'Language',
    'اختر لغة التطبيق': 'Choose the app language',

    // errors
    'بيانات الدخول غير صحيحة': 'Incorrect sign-in details',
    'محاولات كثيرة، حاول مرة أخرى بعد قليل': 'Too many attempts, try again in a few minutes',
    'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً': 'Session expired, please sign in again',
    'شغّل خدمة الموقع واسمح للمتصفح بالوصول إليها لتسجيل البصمة': 'Turn on location and allow the browser to use it to check in',
    'يجب التقاط صورة سيلفي واضحة لتسجيل البصمة': 'Take a clear selfie to check in',
    'تعذّر حفظ الصورة، حاول مرة أخرى': 'Could not save the photo, try again',
    'اسمح للتطبيق باستخدام الكاميرا من إعدادات المتصفح': 'Allow camera access in your browser settings',
    'رقم الجوال غير صحيح': 'Invalid mobile number',
    'رقم الجوال مسجّل لموظف آخر': 'This mobile number belongs to another employee',
    'العنصر غير موجود': 'Item not found',
    'تعارض في البيانات، حدّث الصفحة وحاول مجدداً': 'Data conflict, refresh and try again',
    'تم تسجيل حضورك مسبقاً اليوم': 'You already checked in today',
    'تم تسجيل انصرافك مسبقاً اليوم': 'You already checked out today',
    'يجب تسجيل الحضور أولاً': 'Check in first',
    'الرجاء تعبئة الحقول المطلوبة': 'Please fill in the required fields',
    'الرمز السري يجب أن يكون من 4 إلى 8 أرقام': 'The PIN must be 4 to 8 digits',
    'الرقم الوظيفي مستخدم لموظف آخر': 'This employee number is already used',
    'كلمة المرور يجب أن تكون 6 أحرف على الأقل': 'The password must be at least 6 characters',
    'المنطقة الزمنية غير صحيحة': 'Invalid time zone',
    'تعذّر الاتصال بالخادم، تحقق من الإنترنت': 'Could not reach the server, check your internet',
    'حدث خطأ غير متوقع، حاول مرة أخرى': 'Something went wrong, please try again',

    // statuses & common
    'في الوقت': 'On time',
    'متأخر': 'Late',
    'غائب': 'Absent',
    'انصرف': 'Left',
    'إلغاء': 'Cancel',
    'تأكيد': 'Confirm',
    'تحديث': 'Refresh',
    'إغلاق': 'Close',
    'حذف': 'Delete',
    'موظف': 'Employee',
    '←': '→',

    // employee app
    'جهازك لا يدعم تحديد الموقع': 'Your device does not support location',
    'الموقع مغلق': 'Location is off',
    'فعّله واسمح للمتصفح بالوصول': 'turn it on and allow the browser',
    'تعذّر تحديد موقعك': 'Could not get your location',
    'تأكد أن خدمة الموقع مفعّلة': 'make sure location is on',
    'جارٍ تحديد موقعك…': 'Finding your location…',
    'الموقع مفعّل': 'Location on',
    'سيلفي + موقعك الحالي': 'Selfie + your location',
    'شغّل الموقع أولاً': 'Turn on location first',
    'صباح الخير 👋': 'Good morning 👋',
    'مساء الخير 👋': 'Good evening 👋',
    'تسجيل الحضور': 'Check in',
    'تسجيل الانصراف': 'Check out',
    'اكتمل يومك': 'Day complete',
    'نراك غداً بإذن الله': 'See you tomorrow',
    'لم يسجل بعد': 'Not yet',
    'الحضور': 'Check-in',
    'الانصراف': 'Check-out',
    'ساعات العمل': 'Hours worked',
    'دوام اليوم': "Today's shift",
    'آخر 7 أيام': 'Last 7 days',
    'نحدد موقعك…': 'Getting location…',
    'جارٍ التسجيل…': 'Saving…',
    'نرفع الصورة والموقع': 'Uploading photo & location',
    'تم تسجيل الحضور': 'Checked in',
    'تم تسجيل الانصراف': 'Checked out',
    'تم تسجيل حضورك (متأخر)': 'Checked in (late)',
    'تم تسجيل حضورك، يوماً موفقاً ✨': 'Checked in, have a great day ✨',
    'تم تسجيل انصرافك، شكراً لجهودك 🌙': 'Checked out, thanks for your work 🌙',
    'التقط صورة سيلفي الآن لإثبات تواجدك، وسيُحفظ موقعك الحالي معها': 'Take a selfie now to prove you are on site. Your current location is saved with it.',
    'جارٍ تشغيل الكاميرا…': 'Starting camera…',
    'مكان العمل اليوم (اختياري)': 'Where are you working today? (optional)',
    'مثال: مشروع حي النرجس': 'e.g. Al Narjis project',
    'التقط الصورة': 'Take photo',
    'إعادة التصوير': 'Retake',
    'تأكيد الحضور': 'Confirm check-in',
    'تأكيد الانصراف': 'Confirm check-out',
    'اضغط لفتح الكاميرا': 'Tap to open the camera',
    'فتح الكاميرا': 'Open camera',
    'التقط صورة جديدة الآن، لا يمكن استخدام صورة قديمة': 'Take a new photo now, old photos cannot be used',
    'لم ينصرف': 'Not checked out',
    'آخر 30 يوماً': 'Last 30 days',
    'سجل الحضور': 'Attendance log',
    'أيام الحضور': 'Days present',
    'مرات التأخير': 'Late days',
    'إجمالي الساعات': 'Total hours',
    'التفاصيل': 'Details',
    'لا توجد سجلات بعد': 'No records yet',
    'ستظهر هنا بصمات الحضور والانصراف': 'Your check-ins and check-outs will appear here',
    'الجوال': 'Mobile',
    'الرقم الوظيفي': 'Employee no.',
    'الجهة': 'Company',
    'القسم': 'Department',
    'وقت الدوام': 'Shift',
    'مهلة التأخير': 'Late grace',
    'أضف التطبيق للشاشة الرئيسية': 'Add the app to your home screen',
    'من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» للوصول السريع': 'From the browser menu choose “Add to Home Screen” for quick access',
    'تسجيل الخروج': 'Sign out',

    // admin
    'لوحة اليوم': 'Today',
    'الكل': 'All',
    'في العمل': 'At work',
    'حضور': 'In',
    'انصراف': 'Out',
    'اليوم السابق': 'Previous day',
    'اليوم التالي': 'Next day',
    'نسبة الحضور': 'Attendance',
    'حاضر': 'Present',
    'يتحدث تلقائياً': 'auto-refreshing',
    'اضغط على يوم لعرضه': 'Tap a day to view it',
    'ابحث بالاسم أو رقم الجوال أو الموقع': 'Search by name, mobile or site',
    'لا توجد نتائج': 'No results',
    'لا يوجد موظفون بعد': 'No employees yet',
    'أضف موظفيك ليبدأوا بتسجيل الحضور من جوالاتهم': 'Add your employees so they can check in from their phones',
    'إضافة موظف': 'Add employee',
    'لم يُسجّل': 'not recorded',
    'لا توجد صورة': 'No photo',
    'صورة الحضور': 'Check-in photo',
    'صورة الانصراف': 'Check-out photo',
    'الخريطة ↗': 'Map ↗',
    'لم يسجّل حضوره في هذا اليوم': 'Did not check in on this day',
    'الدوام': 'Shift',
    'مدة العمل': 'Time worked',
    'إدارة فريق العمل': 'Manage your team',
    'موقوف': 'Suspended',
    'ابحث عن موظف': 'Search employees',
    'إضافة': 'Add',
    'تعديل بيانات الموظف': 'Edit employee',
    'إضافة موظف جديد': 'New employee',
    'الاسم الكامل *': 'Full name *',
    'رقم الجوال * (للدخول)': 'Mobile number * (for sign-in)',
    'رمز سري جديد': 'New PIN',
    'الرمز السري *': 'PIN *',
    'اتركه فارغاً': 'Leave empty to keep',
    '4-8 أرقام': '4-8 digits',
    'المسمى الوظيفي': 'Job title',
    'الرقم الوظيفي (اختياري)': 'Employee no. (optional)',
    'يُولَّد تلقائياً': 'Generated automatically',
    'بداية الدوام': 'Shift start',
    'نهاية الدوام': 'Shift end',
    'حساب نشط': 'Active account',
    'إيقاف الحساب يمنع الموظف من تسجيل الدخول': 'Suspending the account stops the employee from signing in',
    'حفظ التعديلات': 'Save changes',
    'إضافة الموظف': 'Add employee',
    'حذف الموظف': 'Delete employee',
    'أرسل بيانات الدخول للموظف:': 'Send the sign-in details to the employee:',
    'الرابط': 'Link',
    'مشاركة': 'Share',
    'تم': 'Done',
    'تم حفظ التعديلات': 'Changes saved',
    'حذف نهائي': 'Delete permanently',
    'تم حذف الموظف': 'Employee deleted',
    'سجلات الحضور': 'Attendance records',
    'تقارير وتصدير': 'Reports & export',
    'كل الموظفين': 'All employees',
    'من': 'From',
    'إلى': 'To',
    'الموظف': 'Employee',
    'عرض': 'Show',
    'تصدير Excel': 'Export Excel',
    'التأخير': 'Late',
    'الساعات': 'Hours',
    'لا توجد سجلات في هذه الفترة': 'No records in this period',
    'حذف السجل': 'Delete record',
    'سيتمكن الموظف من تسجيل البصمة لهذا اليوم من جديد.': 'The employee will be able to check in again for this day.',
    'تم حذف السجل': 'Record deleted',
    'تم تصدير الملف': 'File exported',
    'إعدادات المنشأة': 'Company settings',
    'المنشأة': 'Company',
    'اسم المنشأة': 'Company name',
    'المنطقة الزمنية': 'Time zone',
    'مهلة التأخير (دقائق)': 'Late grace (minutes)',
    'الأمان': 'Security',
    'كلمة مرور جديدة للوحة التحكم': 'New dashboard password',
    'اتركها فارغة لعدم التغيير': 'Leave empty to keep it',
    'حفظ الإعدادات': 'Save settings',
    'رابط الموظفين': 'Employee link',
    'شارك هذا الرابط مع موظفيك لتسجيل الحضور من جوالاتهم': 'Share this link with your employees so they can check in from their phones',
    'نسخ': 'Copy',
    'تم نسخ الرابط': 'Link copied',
    'تم الحفظ وتغيير كلمة المرور': 'Saved and password changed',
    'تم حفظ الإعدادات': 'Settings saved',

    // multiple prints, PINs, prints log
    'تسجيل حضور جديد': 'Check in again',
    'بصمات اليوم': "Today's prints",
    'الرمز': 'PIN',
    'الاسم · الجوال · الرمز السري': 'Name · mobile · PIN',
    'إظهار الرموز': 'Show PINs',
    'إخفاء الرموز': 'Hide PINs',
    'إعادة تعيين الرمز السري': 'Reset PIN',
    'الرمز غير محفوظ، أعد تعيينه لعرضه': 'PIN not stored, reset it to view it',
    'الرمز السري الجديد': 'New PIN',
    'سيتم تسجيل خروج الموظف من جميع الأجهزة، ويدخل بالرمز الجديد.': 'The employee will be signed out on all devices and must use the new PIN.',
    'حفظ الرمز الجديد': 'Save new PIN',
    'تم تغيير الرمز السري': 'PIN changed',
    'حذف بصمات هذا اليوم': "Delete this day's prints",
    'سيتم حذف كل بصمات وصور هذا الموظف لهذا اليوم، ويمكنه التسجيل من جديد.': "All of this employee's prints and photos for this day will be deleted, and they can check in again.",
    'البصمات': 'Prints',
    'كل البصمات': 'All prints',
    'كل بصمة مع الصورة والموقع': 'Every print with photo and location',
    'اترك التاريخ فارغاً لعرض كل البصمات منذ البداية': 'Leave the dates empty to see every print since the start',
    'البصمات المعروضة': 'Prints shown',
    'حضور / انصراف': 'In / out',
    'لا توجد بصمات': 'No prints',
    'تحميل المزيد': 'Load more',
    '— نهاية السجل —': '— End of log —',
    'الوقت': 'Time',
    'الموقع': 'Site',
    'الإحداثيات': 'Coordinates',
    'فتح على الخريطة': 'Open in maps',
    'النوع': 'Type',
    'الدقة (م)': 'Accuracy (m)',

    // working hours sheet
    'أوقات الدوام': 'Working hours',
    'اختيار سريع': 'Quick pick',
    'يُحسب التأخير من بداية الدوام بعد مهلة التأخير المحددة في الإعدادات.': 'Lateness counts from the shift start, after the grace minutes set in Settings.',
    'حفظ أوقات الدوام': 'Save working hours',
    'تعديل البيانات': 'Edit details',
    'إعادة تعيين الرمز': 'Reset PIN',
    'تم حفظ أوقات الدوام': 'Working hours saved',

    // safety papers
    'أوراقي': 'My papers',
    'الأوراق': 'Papers',
    'أوراق السلامة': 'Safety papers',
    'صوّر الأوراق وارفعها PDF': 'Photograph papers and upload them as PDF',
    'رفع ورقة جديدة': 'Upload a new paper',
    'صوّر كل صفحة بالكاميرا، ونحوّلها لك إلى ملف PDF واحد': 'Photograph each page and we turn them into one PDF',
    'تصوير الأوراق': 'Scan papers',
    'أوراقي المرفوعة': 'My uploaded papers',
    'لم ترفع أي أوراق بعد': 'No papers uploaded yet',
    'التقاط صفحة': 'Capture page',
    'من الصور': 'From photos',
    'اسم المستند *': 'Document name *',
    'مثال: شهادة سلامة': 'e.g. Safety certificate',
    'ملاحظة (اختياري)': 'Note (optional)',
    'حفظ كـ PDF ورفع': 'Save as PDF & upload',
    'حذف الصفحة': 'Remove page',
    'استخدم «من الصور» لإضافة الصفحات': 'Use “From photos” to add pages',
    'تم رفع الملف بنجاح ✓': 'File uploaded ✓',
    'صفحة': 'page',
    'صفحات': 'pages',
    'الملف غير صالح، صوّر الصفحات مرة أخرى': 'Invalid file, please scan the pages again',
    'الملف كبير جداً، قلّل عدد الصفحات': 'The file is too large, use fewer pages',
    'المستندات التي رفعها الموظفون': 'Documents uploaded by employees',
    'لا توجد أوراق مرفوعة': 'No papers uploaded',
    'فتح الملف': 'Open file',
    'تاريخ الرفع': 'Uploaded',
    'عدد الصفحات': 'Pages',
    'حجم الملف': 'File size',
    'ملاحظة': 'Note',
    'فتح الملف PDF': 'Open PDF',
    'حذف الملف': 'Delete file',
    'سيتم حذف هذا المستند نهائياً.': 'This document will be deleted permanently.',
    'تم حذف الملف': 'File deleted',

    // CSV headers
    'التاريخ': 'Date',
    'الاسم': 'Name',
    'موقع الحضور': 'Check-in site',
    'إحداثيات الحضور': 'Check-in coordinates',
    'موقع الانصراف': 'Check-out site',
    'إحداثيات الانصراف': 'Check-out coordinates',
    'الحالة': 'Status',
  };

  // Strings that contain numbers or names.
  const PATTERNS = [
    [/^الدقة ±([\d.,]+) م$/, (n) => `accuracy ±${n} m`],
    [/^±([\d.,]+) م$/, (n) => `±${n} m`],
    [/^([\d.,]+) موظف نشط$/, (n) => `${n} active employee${n === '1' ? '' : 's'}`],
    [/^([\d.,]+) نشط من ([\d.,]+)$/, (a, b) => `${a} active of ${b}`],
    [/^([\d.,]+) دقيقة$/, (n) => `${n} min`],
    [/^تمت إضافة (.+)$/, (n) => `${n} added`],
    [/^سيتم حذف (.+) وجميع سجلات حضوره نهائياً\. يمكنك بدلاً من ذلك إيقاف الحساب\.$/,
      (n) => `${n} and all their attendance records will be deleted permanently. You can suspend the account instead.`],
  ];

  let lang = 'ar';
  try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch (e) {}

  function one(x) {
    if (Object.prototype.hasOwnProperty.call(EN, x)) return EN[x];
    for (const [re, fn] of PATTERNS) { const m = x.match(re); if (m) return fn(...m.slice(1)); }
    return null;
  }
  // Translates a piece of UI text; whitespace is kept, and "a · b" parts are translated one by one.
  function tr(s) {
    if (lang !== 'en' || !s || !AR.test(s)) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    let out = one(m[2]);
    if (out === null && /·/.test(m[2])) {
      const parts = m[2].split(/(\s*·\s*)/);
      if (parts.some((p, i) => i % 2 === 0 && one(p.trim()) !== null)) {
        out = parts.map((p, i) => (i % 2 ? p : (one(p.trim()) ?? p))).join('');
      }
    }
    return out === null ? s : m[1] + out + m[3];
  }
  // T('Arabic text') for strings that never reach the page (CSV, share text, document title).
  const T = (s) => (lang === 'en' ? (one(s) ?? s) : s);

  /* ── page translation ── */
  const origText = new WeakMap();
  const origAttr = new WeakMap();
  const skip = (el) => el && el.closest && el.closest('[data-no-i18n], script, style');

  function translateNode(n) {
    if (n.nodeType === 3) {
      if (!AR.test(n.data) || skip(n.parentElement)) return;
      const t = tr(n.data);
      if (t !== n.data) { origText.set(n, n.data); n.data = t; }
      return;
    }
    if (n.nodeType !== 1 || skip(n)) return;
    for (const a of ATTRS) {
      const v = n.getAttribute(a);
      if (v && AR.test(v)) {
        const t = tr(v);
        if (t !== v) {
          const o = origAttr.get(n) || {};
          o[a] = v; origAttr.set(n, o);
          n.setAttribute(a, t);
        }
      }
    }
    for (const c of n.childNodes) translateNode(c);
  }
  function restoreNode(n) {
    if (n.nodeType === 3) { if (origText.has(n)) { n.data = origText.get(n); origText.delete(n); } return; }
    if (n.nodeType !== 1) return;
    const o = origAttr.get(n);
    if (o) { for (const a in o) n.setAttribute(a, o[a]); origAttr.delete(n); }
    for (const c of n.childNodes) restoreNode(c);
  }

  const baseTitle = document.title;
  function applyDocument() {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'en' ? 'ltr' : 'rtl';
    document.title = T(baseTitle);
  }
  applyDocument();

  const observer = new MutationObserver((list) => {
    if (lang !== 'en') return;
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else translateNode(m.target);
    }
  });
  function start() {
    if (lang === 'en') translateNode(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  function setLang(l) {
    l = l === 'en' ? 'en' : 'ar';
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    applyDocument();
    if (lang === 'en') translateNode(document.body); else restoreNode(document.body);
    window.dispatchEvent(new CustomEvent('fikr:lang', { detail: { lang } }));
  }

  // Any element with data-lang="ar|en" inside a .lang-switch switches the language.
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.lang-switch [data-lang]');
    if (!b) return;
    ev.preventDefault();
    setLang(b.dataset.lang);
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  });

  const switchHtml = (extra) =>
    `<div class="lang-switch ${extra || ''}" role="group" aria-label="Language / اللغة" data-no-i18n>` +
    '<button type="button" data-lang="ar" lang="ar">عربي</button><button type="button" data-lang="en" lang="en">EN</button></div>';

  window.FikrI18n = {
    get lang() { return lang; },
    get locale() { return lang === 'en' ? 'en-US' : 'ar-u-nu-latn'; },
    T, tr, setLang, switchHtml,
  };
})();

/*
 * بيانات لوحة «مؤشرات لقاءات»
 * ---------------------------------------------------------------
 * ⚠️ جميع الأرقام في هذا الملف بيانات تجريبية لاختبار التفاعل فقط،
 *    وليست إحصائيات رسمية. استبدلها بالبيانات المعتمدة عند توفرها،
 *    ثم غيّر meta.isDemo إلى false لإخفاء تنبيه «بيانات تجريبية».
 *
 * لماذا ملف .js وليس .json؟ حتى تعمل اللوحة بفتح index.html مباشرةً
 * من القرص (file://) دون خادم؛ المتصفحات تمنع fetch للملفات المحلية.
 * البنية مطابقة لـ JSON تمامًا: يمكن نسخ المحتوى بعد "=" إلى ملف JSON.
 *
 * الحقول لكل منطقة:
 *   name              اسم المنطقة (يظهر على الخريطة والأزرار)
 *   title             عنوان اللوحة اليمنى (مثل «منطقة الرياض»)
 *   visitors          عدد الزوار
 *   guidanceSessions  جلسات الإرشاد
 *   workshops         ورش العمل
 *   jobOpportunities  الفرص الوظيفية
 *   sectors           أسماء القطاعات (الأيقونة تُختار تلقائيًا من sectorIcons)
 *   venues            [{ name, image }] — مصفوفة فارغة تُظهر «لا توجد مواقع مضافة لهذه المنطقة»
 *   headerImage       صورة بانورامية خلف عنوان اللوحة (اختياري)
 *
 * ترتيب المفاتيح في regions هو ترتيب أزرار الشريط السفلي (من اليمين لليسار).
 */
window.LIQAAT_DATA = {
  meta: {
    isDemo: true,
    demoNotice: "بيانات تجريبية للعرض – ليست إحصائيات رسمية",
    defaultRegion: "riyadh"
  },

  /* اسم القطاع ← مفتاح الأيقونة في js/icons.js */
  sectorIcons: {
    "الصناعة": "industry",
    "تقنية المعلومات": "it",
    "الرعاية الصحية": "health",
    "التعليم": "education",
    "التجارة": "trade",
    "السياحة": "tourism",
    "الزراعة": "agriculture",
    "الطاقة": "energy",
    "النقل والخدمات اللوجستية": "logistics",
    "التعدين": "mining",
    "الثروة السمكية": "fisheries",
    "الثقافة والتراث": "culture",
    "الضيافة": "hospitality",
    "الخدمات البحرية": "maritime"
  },

  regions: {
    "riyadh": {
      name: "الرياض",
      title: "منطقة الرياض",
      visitors: 12450,
      guidanceSessions: 320,
      workshops: 58,
      jobOpportunities: 420,
      sectors: ["الصناعة", "تقنية المعلومات", "الرعاية الصحية", "التعليم", "التجارة"],
      headerImage: "assets/img/skyline-riyadh-header.jpg",
      /* أمثلة بصرية مؤقتة – ليست مواقع مؤكدة لإقامة لقاءات */
      venues: [
        { name: "مركز الملك عبدالله المالي", image: "assets/img/venue-kafd.jpg" },
        { name: "واجهة روشن", image: "assets/img/venue-roshn.jpg" },
        { name: "جامعة الملك سعود", image: "assets/img/venue-ksu.jpg" },
        { name: "مركز الرياض الدولي للمؤتمرات والمعارض", image: "assets/img/venue-ricec.jpg" }
      ]
    },
    "eastern": {
      name: "المنطقة الشرقية",
      title: "المنطقة الشرقية",
      visitors: 9870,
      guidanceSessions: 265,
      workshops: 47,
      jobOpportunities: 385,
      sectors: ["الطاقة", "الصناعة", "النقل والخدمات اللوجستية", "تقنية المعلومات", "التجارة"],
      venues: []
    },
    "najran": {
      name: "نجران",
      title: "منطقة نجران",
      visitors: 2140,
      guidanceSessions: 74,
      workshops: 15,
      jobOpportunities: 96,
      sectors: ["الزراعة", "السياحة", "التجارة", "التعليم", "الثقافة والتراث"],
      venues: []
    },
    "jazan": {
      name: "جازان",
      title: "منطقة جازان",
      visitors: 3460,
      guidanceSessions: 112,
      workshops: 21,
      jobOpportunities: 148,
      sectors: ["الزراعة", "الصناعة", "الثروة السمكية", "السياحة", "النقل والخدمات اللوجستية"],
      venues: []
    },
    "asir": {
      name: "عسير",
      title: "منطقة عسير",
      visitors: 4280,
      guidanceSessions: 138,
      workshops: 26,
      jobOpportunities: 172,
      sectors: ["السياحة", "الزراعة", "الضيافة", "التعليم", "الثقافة والتراث"],
      venues: []
    },
    "bahah": {
      name: "الباحة",
      title: "منطقة الباحة",
      visitors: 1520,
      guidanceSessions: 52,
      workshops: 11,
      jobOpportunities: 64,
      sectors: ["السياحة", "الزراعة", "التعليم", "الرعاية الصحية", "التجارة"],
      venues: []
    },
    "makkah": {
      name: "مكة المكرمة",
      title: "منطقة مكة المكرمة",
      visitors: 10630,
      guidanceSessions: 290,
      workshops: 52,
      jobOpportunities: 401,
      sectors: ["الضيافة", "التجارة", "الخدمات البحرية", "الرعاية الصحية", "تقنية المعلومات"],
      venues: []
    },
    "madinah": {
      name: "المدينة المنورة",
      title: "منطقة المدينة المنورة",
      visitors: 6920,
      guidanceSessions: 184,
      workshops: 34,
      jobOpportunities: 256,
      sectors: ["الضيافة", "الصناعة", "التعليم", "الرعاية الصحية", "التجارة"],
      venues: []
    },
    "qassim": {
      name: "القصيم",
      title: "منطقة القصيم",
      visitors: 4810,
      guidanceSessions: 146,
      workshops: 29,
      jobOpportunities: 188,
      sectors: ["الزراعة", "الصناعة", "التجارة", "التعليم", "النقل والخدمات اللوجستية"],
      venues: []
    },
    "hail": {
      name: "حائل",
      title: "منطقة حائل",
      visitors: 2630,
      guidanceSessions: 88,
      workshops: 17,
      jobOpportunities: 110,
      sectors: ["الزراعة", "السياحة", "التعدين", "التعليم", "التجارة"],
      venues: []
    },
    "tabuk": {
      name: "تبوك",
      title: "منطقة تبوك",
      visitors: 3950,
      guidanceSessions: 121,
      workshops: 24,
      jobOpportunities: 205,
      sectors: ["السياحة", "الطاقة", "تقنية المعلومات", "الزراعة", "الضيافة"],
      venues: []
    },
    "jawf": {
      name: "الجوف",
      title: "منطقة الجوف",
      visitors: 1870,
      guidanceSessions: 63,
      workshops: 13,
      jobOpportunities: 79,
      sectors: ["الزراعة", "الطاقة", "الصناعة", "التعليم", "التجارة"],
      venues: []
    },
    "northern-borders": {
      name: "الحدود الشمالية",
      title: "منطقة الحدود الشمالية",
      visitors: 1340,
      guidanceSessions: 47,
      workshops: 9,
      jobOpportunities: 58,
      sectors: ["التعدين", "الصناعة", "النقل والخدمات اللوجستية", "التعليم", "التجارة"],
      venues: []
    }
  }
};

import { RotateCcw } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";

export default function RefundPage() {
  return (
    <FooterPageLayout
      title="سياسة الاسترداد"
      subtitle="شفافية كاملة حول حقوقك في استرداد المدفوعات"
      icon={<RotateCcw size={28} />}
      lastUpdated="يوليو 2025"
    >
      <div className="space-y-8 text-white/80 text-[15px] leading-[1.9]">
        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">1. نظرة عامة</h2>
          <p>
            في GARFIX، نؤمن بأن رضا العميل هو أولوية قصوى. نريدك أن تشعر بالثقة الكاملة عند
            الاشتراك في خدماتنا. لذلك، نقدم سياسة استرداد عادلة وشفافة تضمن حقوقك في حال لم
            تكن راضياً عن الخدمة. نحن واثقون من جودة منصتنا، وندرك أن كل عمل له احتياجات مختلفة،
            لذلك صممنا سياسة الاسترداد لتكون مرنة ومنصفة للطرفين.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">2. الفترة التجريبية المجانية</h2>
          <p>
            نوفر فترة تجريبية مجانية كاملة لمدة 30 يوماً تشمل جميع ميزات المنصة بدون قيود.
            خلال هذه الفترة، لا يُطلب منك إدخال أي بيانات دفع. الهدف من الفترة التجريبية هو
            تمكينك من تقييم المنصة بشكل كامل والتأكد من ملاءمتها لاحتياجات عملك قبل الالتزام
            بأي اشتراك مدفوع. نوصي باستغلال الفترة التجريبية بالكامل لاستكشاف جميع الميزات
            وإدخال بيانات حقيقية من أعمالك لتقييم تجربة الاستخدام الفعلية.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">3. ضمان استرداد 14 يوماً</h2>
          <div className="bg-[rgba(124,58,237,0.1)] border border-[rgba(124,58,237,0.25)] rounded-xl p-6 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-white font-black text-lg">
                14
              </div>
              <div>
                <h3 className="font-extrabold text-white text-lg">ضمان استرداد الأموال</h3>
                <p className="text-white/50 text-sm">من تاريخ أول دفعة للاشتراك</p>
              </div>
            </div>
            <p>
              إذا لم تكن راضياً عن المنصة خلال أول 14 يوماً من تاريخ الاشتراك المدفوع، يمكنك
              طلب استرداد كامل للمبلغ المدفوع بدون أي أسئلة. يتم معالجة طلبات الاسترداد خلال
              5-10 أيام عمل كحد أقصى.
            </p>
          </div>
          <p>
            يشترط للاسترداد أن يكون الحساب في حالة نشطة وأنه لم يسبق استخدام المنصة لفترة
            تتجاوز 14 يوماً من تاريخ أول دفعة. يُرجى ملاحظة أن ضمان الاسترداد ينطبق مرة
            واحدة فقط لكل مستخدم أو شركة.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">4. الاسترداد بعد 14 يوماً</h2>
          <p>
            بعد انقضاء فترة ضمان الـ 14 يوماً، يتم التعامل مع طلبات الاسترداد بشكل فردي بناءً
            على الظروف المحددة. قد نقدم استرداداً نسبياً في الحالات التالية:
          </p>
          <ul className="list-disc pr-6 space-y-2 text-white/70 mt-3">
            <li>أعطال تقنية جوهرية مؤثرة حالت دون استخدام المنصة بشكل معقول</li>
            <li>عدم توفر ميزات أساسية تم الإعلان عنها ولم يتم توفيرها خلال فترة معقولة</li>
            <li>أخطاء في الفوترة أدت إلى خصم مبالغ غير صحيحة</li>
            <li>ظروف استثنائية يوافق عليها فريق الدعم بعد مراجعة الحالة</li>
          </ul>
          <p className="mt-3">
            لا يُسترد المبلغ في حالات مثل: تغيير الرأي بعد فترة الاستخدام، عدم استخدام المنصة
            بشكل كافٍ (حيث يمكن إلغاء الاشتراك بدلاً من ذلك)، أو المخالفة الجسيمة لشروط الاستخدام.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">5. الاشتراكات السنوية</h2>
          <p>
            بالنسبة للاشتراكات السنوية، يسرى ضمان الاسترداد لمدة 14 يوماً من تاريخ الشراء.
            بعد هذه الفترة، يمكن إلغاء الاشتراك السنوي مع استرداد نسبي للفترة المتبقية غير
            المستخدمة، بشرط تقديم طلب الإلغاء قبل 30 يوماً على الأقل من تاريخ التجديد التالي.
            يتم احتساب الاسترداد النسبي بناءً على الأشهر المتبقية من فترة الاشتراك مع خصم
            قيمة الأشهر المستخدمة وفقاً للسعر الشهري المعتاد.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">6. كيفية طلب الاسترداد</h2>
          <div className="bg-white/[0.03] rounded-xl p-5 space-y-4">
            {[
              { step: "1", title: "تواصل مع الدعم", desc: "أرسل طلب استرداد عبر مركز المساعدة أو البريد الإلكتروني مع ذكر سبب الطلب" },
              { step: "2", title: "مراجعة الطلب", desc: "يراجع فريق الدعم طلبك خلال يومي عمل ويُخطرك بالقرار" },
              { step: "3", title: "تأكيد الاسترداد", desc: "في حال الموافقة، يتم إعادة المبلغ إلى طريقة الدفع الأصلية خلال 5-10 أيام عمل" },
              { step: "4", title: "تصدير البيانات", desc: "يُنصح بتصدير بياناتك قبل معالجة الاسترداد — يتوفر 30 يوماً للتصدير بعد الإلغاء" },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {item.step}
                </div>
                <div>
                  <div className="font-bold text-white text-sm">{item.title}</div>
                  <div className="text-white/60 text-[13px]">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">7. طرق إعادة الأموال</h2>
          <p>
            يتم إعادة الأموال عبر نفس طريقة الدفع الأصلية المستخدمة في الشراء. في حال الدفع
            ببطاقة ائتمان، يُعاد المبلغ إلى البطاقة ذاتها. في حال التحويل البنكي، يتم تحويل
            المبلغ إلى الحساب البنكي الأصلي. قد تستغرق معالجة الاسترداد من 5 إلى 10 أيام عمل
            حسب سياسات الجهة المالية الوسيطة. أي رسوم بنكية أو تحويل ناتجة عن عملية الاسترداد
            تتحملها GARFIX.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-white mb-3">8. التواصل</h2>
          <p>
            لطرح أي أسئلة حول سياسة الاسترداد أو لتقديم طلب استرداد، يمكنك التواصل معنا عبر{" "}
            <a href="/contact" className="text-[#c4b5fd] underline hover:text-white transition-colors">
              صفحة التواصل
            </a>{" "}
            أو زيارة{" "}
            <a href="/help" className="text-[#c4b5fd] underline hover:text-white transition-colors">
              مركز المساعدة
            </a>. فريق الدعم متاح على مدار الساعة لمساعدتك.
          </p>
        </section>
      </div>
    </FooterPageLayout>
  );
}

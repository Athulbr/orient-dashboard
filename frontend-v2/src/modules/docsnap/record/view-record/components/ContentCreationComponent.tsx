import React from "react";
import { Button } from "../../../../../components/Button";
import { useViewRecordState } from "../hooks/viewRecordContext";
import { useViewRecordApi } from "../hooks/useViewRecordApi";
import { useToastStore } from "../../../../../components/toast/ToastStore";
import Spinner from "../../../../../components/Spinner";

interface ContentCreationComponentIF {
  test?: string;
}

const ContentCreationComponent: React.FC<ContentCreationComponentIF> = () => {
  const { state, setState } = useViewRecordState();
  const { sendContentCreationContext } = useViewRecordApi();
  const toast = useToastStore();
  const [loading, setLoading] = React.useState(false);

  const handleCreateProductBlog = async () => {
    try {
      setLoading(true);
      const res = await sendContentCreationContext({
        context: state.record?.extractedData,
      });
      setState((prev) => ({ ...prev, blogContent: res.data.content }));
      toast.success("Product Blog created successfully");
    } catch (error) {
      console.error("error:===========", error);
      toast.error("Failed to create Product Blog");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col gap-4 overflow-y-auto p-4 bg-gray-50 rounded-xl">
      {/* Show Blog Content if available */}
      {state.blogContent ? (
        <div className="bg-white shadow-md rounded-xl p-6 prose max-w-none overflow-x-auto">
          {/* Use dangerouslySetInnerHTML to render markdown / html content if needed */}
          <div
            dangerouslySetInnerHTML={{
              __html: state.blogContent,
            }}
          />
        </div>
      ) : (
        <div className="flex justify-center items-center w-full h-full">
        <Button
          onClick={handleCreateProductBlog}
          className="px-6 py-2 rounded-lg"
          disabled={loading}
          startIcon={loading ? <Spinner size={16} /> : null}
        >
          {loading ? "Creating Content..." : state.blogContent ? "Regenerate Content" : "Create Content"}
        </Button>
      </div>
      )}

      {/* Button stays at bottom */}
      
    </div>
  );
};

export default ContentCreationComponent;

const sampleBlog=`### sampleBlog Title Options:
1. "Say Goodbye to Crutch Discomfort: Discover the Ultimate Elbow Covers"
2. "Transform Your Mobility Experience with KMINA Elbow Covers"
3. "Comfort and Protection for Crutch Users: The KMINA Advantage"

### Introduction: The Problem Hook
Using crutches can be a lifesaver when recovering from an injury or managing a long-term condition. But let’s face it—crutches come with their own set of challenges. From painful chafing on your elbows and forearms to the constant discomfort of ill-fitting accessories, crutch users often find themselves battling more than just mobility issues. If you’ve ever felt the sting of raw skin or the ache of prolonged use, you’re not alone. The good news? There’s a solution that can make your crutch experience not just bearable but genuinely comfortable.

### Introducing the Solution: KMINA Adult Crutch Elbow Covers
Meet the KMINA Adult Crutch Elbow Covers (x2), a game-changing accessory designed to enhance your mobility experience. Crafted with a double layer of high-quality neoprene, these covers are more than just padding—they’re your ticket to comfort, protection, and ease. Whether you’re recovering from surgery or navigating daily life with crutches, KMINA elbow covers are here to make every step smoother.

### Feature → Benefit Breakdown
#### 1. **Double Layer of Neoprene for Maximum Comfort**
   - **Feature:** The KMINA elbow covers are made with a double layer of neoprene.
   - **Benefit:** This innovative design ensures a snug, cushioned fit that reduces pressure on your elbows and forearms. Say goodbye to soreness and hello to all-day comfort.
   - **Use Case:** Imagine using crutches for hours without the nagging pain in your arms. With KMINA covers, you can focus on your recovery, not your discomfort.

#### 2. **Prevents Chafing and Skin Irritation**
   - **Feature:** Designed to prevent chafing on the elbow and forearm.
   - **Benefit:** No more raw skin or irritation from prolonged crutch use. These covers protect your skin, allowing you to move freely without worry.
   - **Before-After Scenario:** Before: Constantly adjusting your crutches to avoid painful rubbing. After: Effortless mobility with zero irritation.

#### 3. **Easy to Attach and Adjust**
   - **Feature:** Innovative design with an opening at the bottom for adjustment.
   - **Benefit:** Quick and hassle-free installation means you can start using them right away. The secure fit ensures stability during use.
   - **Example:** Whether you’re heading to work or running errands, these covers stay in place, giving you one less thing to worry about.

#### 4. **Enhanced Fit for Better Arm Support**
   - **Feature:** Provides a better fit for the user’s arm to the crutch.
   - **Benefit:** Improved alignment reduces strain on your arms, making crutch use more ergonomic and less tiring.
   - **Use Case:** Perfect for long-term crutch users who need reliable support day in and day out.

#### 5. **Lightweight and Durable Design**
   - **Feature:** Crafted with high-quality neoprene material.
   - **Benefit:** Lightweight yet durable, these covers are built to last. They’re easy to clean and maintain, ensuring long-term usability.
   - **Example:** A sleek design that blends seamlessly with your crutches, adding a touch of style to functionality.

### Proof & Trust Builders
#### Testimonials
- *“I’ve been using crutches for months, and the KMINA elbow covers have been a game-changer. No more pain or irritation—just pure comfort!”* – Sarah T.
- *“These covers are so easy to use and make such a difference. I can’t imagine using crutches without them now.”* – John D.

#### Hypothetical Case Study
Imagine Jane, a busy professional recovering from a leg injury. Before discovering KMINA elbow covers, she struggled with painful chafing and constant discomfort. After switching to KMINA, Jane found herself able to focus on her work and recovery without the added stress of crutch-related pain. Her productivity soared, and her mobility experience transformed.

### Comparisons: Why KMINA Stands Out
While there are other crutch accessories on the market, KMINA elbow covers offer a unique combination of comfort, durability, and ease of use. Unlike generic pads that wear out quickly or fail to provide adequate protection, KMINA covers are designed with the user in mind. Their double-layer neoprene construction and ergonomic design set them apart as the gold standard for crutch accessories.

### Implementation Guide: How to Get Started
1. **Purchase Your KMINA Elbow Covers:** Visit [KMINA’s official website](https://kmina.com/en-us/collections/accesorios-movilidad/products/funda-muletas-codo) to order your set.
2. **Attach the Covers:** Simply insert the crutch through the opening at the bottom and adjust for a secure fit.
3. **Enjoy Enhanced Comfort:** Experience the difference as you move through your day with ease and protection.
4. **Maintain Your Covers:** Clean them regularly to ensure long-lasting performance.

### Call-to-Action
Don’t let crutch discomfort hold you back. Transform your mobility experience with KMINA Adult Crutch Elbow Covers. Order now and take the first step toward pain-free, comfortable movement. Visit [KMINA’s website](https://kmina.com/en-us/collections/accesorios-movilidad/products/funda-muletas-codo) today and make your recovery journey smoother than ever!`
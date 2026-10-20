import mongoose from "mongoose";

const images = [
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1524813686514-a57563d77d61?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&auto=format&fit=crop&q=80"
];

const run = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/dreamcity");
    const collection = mongoose.connection.collection("projects");
    const allProjects = await collection.find({}).toArray();
    for (let i = 0; i < allProjects.length; i++) {
      const p = allProjects[i];
      if (!p.image || p.image === "") {
        const chosenImg = images[i % images.length];
        const gallery = [chosenImg, images[(i + 1) % images.length], images[(i + 2) % images.length]];
        await collection.updateOne({ _id: p._id }, { $set: { image: chosenImg, images: gallery } });
        console.log(`Updated project ${p.customId} (${p.title}) with image: ${chosenImg}`);
      }
    }
    console.log("All projects in MongoDB now have images.");
  } catch (err) {
    console.error("Error updating project images:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();

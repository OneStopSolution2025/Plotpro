import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function inspectJeevaSubscription() {
  await mongoose.connect(process.env.MONGODB_URI);
  const usersColl = mongoose.connection.collection("users");
  const subsColl = mongoose.connection.collection("subscriptions");

  const superAdmin = await usersColl.findOne({ email: "jeevaharis49@gmail.com" });
  if (!superAdmin) {
    console.error("Super Admin jeevaharis49@gmail.com not found!");
    await mongoose.disconnect();
    return;
  }

  const subscriptions = await subsColl.find({ subscriberId: superAdmin._id }).toArray();
  console.log("Subscriptions for jeevaharis49@gmail.com:", subscriptions);

  await mongoose.disconnect();
}

inspectJeevaSubscription();

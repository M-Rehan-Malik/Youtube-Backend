import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";


const connectToDB = async () => {
    try {
        const connection = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.log("Error in connecting to DB", error);
        process.exit(1)
    }
}

export default connectToDB;
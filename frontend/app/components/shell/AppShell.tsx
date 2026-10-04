"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { AppStateProvider, useAppState } from "../../context/AppState";
import { DataProvider } from "../../context/DataContext";
import LoadingScreen from "../LoadingScreen";
import Skeleton from "../Skeleton";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

const viewLoading = () => (
  <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
    <Skeleton className="h-64" />
  </div>
);

const MissionView = dynamic(() => import("../../views/MissionView"), { loading: viewLoading });
const HazardsView = dynamic(() => import("../../views/HazardsView"), { loading: viewLoading });
const ClimateView = dynamic(() => import("../../views/ClimateView"), { loading: viewLoading });
const CitiesView = dynamic(() => import("../../views/CitiesView"), { loading: viewLoading });
const SystemView = dynamic(() => import("../../views/SystemView"), { loading: viewLoading });

function ActiveView() {
  const { view } = useAppState();
  switch (view) {
    case "hazards": return <HazardsView />;
    case "climate": return <ClimateView />;
    case "cities": return <CitiesView />;
    case "system": return <SystemView />;
    default: return <MissionView />;
  }
}

export default function AppShell() {
  const [showLoader, setShowLoader] = useState(true);
  return (
    <AppStateProvider>
      <DataProvider>
        {showLoader && <LoadingScreen onComplete={() => setShowLoader(false)} />}
        <div className="min-h-screen bg-[#05070d] text-white">
          <TopBar />
          <main className="pb-24 md:pb-8">
            <ActiveView />
          </main>
          <BottomNav />
        </div>
      </DataProvider>
    </AppStateProvider>
  );
}

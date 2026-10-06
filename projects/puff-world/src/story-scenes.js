import * as T from "three";

// Each scene teaches one cause, then shows the player's next action.
export const STAGE_SCENES = {
  LUNG: [
    {
      text: "Vape aerosol can carry particles, metals and harmful chemicals.",
      time: 3.6,
      target: [1, 2, 1],
      camera: [-7, 6, 10],
    },
    {
      text: "Breathe away twelve particles before they reach the garden.",
      time: 3.6,
      target: [-3, 1, 1],
      camera: [-11, 5, 8],
    },
  ],
  HEART: [
    {
      text: "Nicotine can increase heart rate and blood pressure.",
      time: 3.8,
      target: [28, 2.8, -6],
      camera: [19, 7, 7],
    },
    {
      text: "The steps move with the faster pulse. Jump to light all four.",
      time: 3.8,
      target: [28, 1, 0],
      camera: [18, 9, 13],
    },
  ],
  BRAIN: [
    {
      text: "Nicotine gives a brief reward. Then the feeling fades.",
      time: 3.6,
      target: [54, 1.6, -2],
      camera: [46, 6, 8],
    },
    {
      text: "The craving returns, pulling us towards it again.",
      time: 3.6,
      target: [51, 1, 1],
      camera: [44, 4, 8],
    },
    {
      text: "Follow the blue path out. Breathe to push the golden lure away.",
      time: 3.6,
      target: [58, 1, 2],
      camera: [45, 10, 12],
    },
  ],
  CHOICE: [
    {
      text: "One more sends us around the same loop.",
      time: 3.2,
      target: [83, 2, -4],
      camera: [75, 4, 1],
    },
    {
      text: "Or we can walk away. This next step is ours.",
      time: 3.2,
      target: [83, 2, 4],
      camera: [75, 4, 9],
    },
  ],
};
export function sceneCamera(shot, time) {
  return {
    target: new T.Vector3(...shot.target),
    desired: new T.Vector3(...shot.camera).add(
      new T.Vector3(time * 0.12, 0, 0),
    ),
  };
}
